export const NATIVE_HOST = "com.tenxwise.bridge"
export const BRIDGE_PERMISSIONS = ["nativeMessaging", "userScripts"]
export const BRIDGE_ORIGINS = ["<all_urls>"]

const MAX_FAILURES = 6
const MAX_DELAY_MS = 60_000
const STABLE_MS = 30_000
const NEW_PAGE_TIMEOUT_MS = 30_000

export type BridgeTab = {
  id?: number
  url?: string
  title?: string
  active?: boolean
  status?: string
  windowId?: number
}

export type UserScriptInjection = {
  target: { tabId: number }
  world: "MAIN" | "USER_SCRIPT"
  js: { code: string }[]
}

export type UserScriptResult = { result?: unknown; error?: string }

export type UserScriptsApi = {
  execute?: (injection: UserScriptInjection) => Promise<UserScriptResult[]>
  getScripts: () => Promise<unknown[]>
}

export type PortLike = {
  postMessage: (message: unknown) => void
  onMessage: { addListener: (listener: (message: unknown) => void) => void }
  onDisconnect: { addListener: (listener: () => void) => void }
}

export type BridgeChrome = {
  runtime: {
    getManifest: () => { version: string }
    connectNative: (name: string) => PortLike
    lastError?: { message?: string }
    onStartup?: { addListener: (listener: () => void) => void }
  }
  permissions: {
    contains: (permissions: { permissions?: string[]; origins?: string[] }) => Promise<boolean>
    onAdded?: { addListener: (listener: () => void) => void }
  }
  tabs: {
    query: (query: { windowType?: "normal" }) => Promise<BridgeTab[]>
    create: (props: { url: string; active: boolean }) => Promise<BridgeTab>
    get: (tabId: number) => Promise<BridgeTab>
    update: (tabId: number, props: { active: boolean }) => Promise<BridgeTab | undefined>
    remove: (tabId: number) => Promise<void>
  }
  windows: {
    update: (windowId: number, props: { focused: boolean }) => Promise<unknown>
  }
  userScripts?: UserScriptsApi
}

export type BridgeError = { code: string; message: string }

export type BridgeRequest = { id: number | string; method: string; params?: unknown }

export type BridgeReply =
  | { id: number | string; ok: true; result: unknown }
  | { id: number | string; ok: false; error: BridgeError }

export class BridgeFailure extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const USER_SCRIPTS_OFF =
  'User scripts are off. Open chrome://extensions, open 10xWise details, and turn on "Allow User Scripts".'

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}

const tabIdParam = (params: unknown): number => {
  const tabId = record(params).tabId
  if (typeof tabId !== "number" || !Number.isInteger(tabId)) {
    throw new BridgeFailure("bad_params", "tabId must be an integer")
  }
  return tabId
}

const existingTab = async (api: BridgeChrome, tabId: number): Promise<BridgeTab> => {
  try {
    return await api.tabs.get(tabId)
  } catch {
    throw new BridgeFailure("tab_gone", `No tab with id ${tabId}`)
  }
}

export const userScriptsUsable = async (api: BridgeChrome): Promise<boolean> => {
  const scripts = api.userScripts
  if (!scripts || typeof scripts.execute !== "function") return false
  try {
    await scripts.getScripts()
    return true
  } catch {
    return false
  }
}

const ping = async (api: BridgeChrome) => ({
  version: api.runtime.getManifest().version,
  userScripts: await userScriptsUsable(api),
  allUrls: await api.permissions.contains({ origins: BRIDGE_ORIGINS })
})

const listPages = async (api: BridgeChrome) => {
  const tabs = await api.tabs.query({ windowType: "normal" })
  return tabs
    .filter((tab): tab is BridgeTab & { id: number } => typeof tab.id === "number")
    .map((tab) => ({
      id: `t${tab.id}`,
      tabId: tab.id,
      url: tab.url ?? "",
      title: tab.title ?? "",
      active: tab.active === true
    }))
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const newPage = async (api: BridgeChrome, params: unknown, timeoutMs: number) => {
  const { url, background } = record(params)
  if (typeof url !== "string" || url.length === 0) {
    throw new BridgeFailure("bad_params", "url must be a string")
  }
  const created = await api.tabs.create({ url, active: background !== true })
  if (typeof created.id !== "number") throw new BridgeFailure("tab_gone", "Tab was not created")
  const tabId = created.id
  let tab = created
  const deadline = Date.now() + timeoutMs
  while (tab.status !== "complete" && Date.now() < deadline) {
    await sleep(Math.min(250, Math.max(0, deadline - Date.now())))
    tab = await existingTab(api, tabId)
  }
  return { tabId, id: `t${tabId}`, url: tab.url || url }
}

const evaluate = async (api: BridgeChrome, params: unknown) => {
  const tabId = tabIdParam(params)
  const code = record(params).code
  if (typeof code !== "string") throw new BridgeFailure("bad_params", "code must be a string")
  const execute = api.userScripts?.execute
  if (!api.userScripts || typeof execute !== "function") {
    throw new BridgeFailure("user_scripts_off", USER_SCRIPTS_OFF)
  }
  await existingTab(api, tabId)
  let results: UserScriptResult[]
  try {
    results = await execute.call(api.userScripts, {
      target: { tabId },
      world: "MAIN",
      js: [{ code: wrapCode(code) }]
    })
  } catch (error) {
    const message = errorMessage(error)
    if (/no tab with id/i.test(message)) throw new BridgeFailure("tab_gone", message)
    if (/user ?scripts|developer mode|allow user scripts/i.test(message)) {
      throw new BridgeFailure("user_scripts_off", USER_SCRIPTS_OFF)
    }
    throw new BridgeFailure("eval_error", message)
  }
  const first = results[0]
  if (first?.error) throw new BridgeFailure("eval_error", first.error)
  const outcome = record(first?.result)
  if (outcome.ok === false) throw new BridgeFailure("eval_error", String(outcome.error))
  if (outcome.ok !== true) throw new BridgeFailure("eval_error", "Script returned no result")
  return outcome.value ?? null
}

export const wrapCode = (code: string) =>
  `(async () => { try { return { ok: true, value: await (${code}\n) } } catch (e) { return { ok: false, error: String((e && e.stack) || e) } } })()`

const selectPage = async (api: BridgeChrome, params: unknown) => {
  const tabId = tabIdParam(params)
  const tab = await existingTab(api, tabId)
  await api.tabs.update(tabId, { active: true })
  if (typeof tab.windowId === "number") await api.windows.update(tab.windowId, { focused: true })
  return { tabId, id: `t${tabId}` }
}

const closePage = async (api: BridgeChrome, params: unknown) => {
  const tabId = tabIdParam(params)
  await existingTab(api, tabId)
  await api.tabs.remove(tabId)
  return { tabId, id: `t${tabId}` }
}

export const runMethod = async (
  api: BridgeChrome,
  method: string,
  params: unknown,
  options: { newPageTimeoutMs?: number } = {}
): Promise<unknown> => {
  switch (method) {
    case "ping":
      return ping(api)
    case "list_pages":
      return listPages(api)
    case "new_page":
      return newPage(api, params, options.newPageTimeoutMs ?? NEW_PAGE_TIMEOUT_MS)
    case "evaluate":
      return evaluate(api, params)
    case "select_page":
      return selectPage(api, params)
    case "close_page":
      return closePage(api, params)
    default:
      throw new BridgeFailure("unknown_method", `Unknown method ${method}`)
  }
}

export const isBridgeRequest = (message: unknown): message is BridgeRequest => {
  const value = record(message)
  return (
    (typeof value.id === "number" || typeof value.id === "string") &&
    typeof value.method === "string"
  )
}

export const handleRequest = async (
  api: BridgeChrome,
  request: BridgeRequest,
  options: { newPageTimeoutMs?: number } = {}
): Promise<BridgeReply> => {
  try {
    const result = await runMethod(api, request.method, request.params, options)
    return { id: request.id, ok: true, result }
  } catch (error) {
    const code = error instanceof BridgeFailure ? error.code : "internal"
    return { id: request.id, ok: false, error: { code, message: errorMessage(error) } }
  }
}

export const backoffDelay = (failures: number): number =>
  Math.min(MAX_DELAY_MS, 1000 * 2 ** Math.max(0, failures - 1))

export const isFatalDisconnect = (message: string | undefined): boolean =>
  !!message && /not found|forbidden|not allowed|access .*denied/i.test(message)

export type BridgeTimers = {
  now: () => number
  setTimeout: (callback: () => void, ms: number) => unknown
}

export const createBridge = (
  api: BridgeChrome,
  timers: BridgeTimers = { now: Date.now, setTimeout: (cb, ms) => setTimeout(cb, ms) }
) => {
  let port: PortLike | null = null
  let failures = 0
  let stopped = false
  let pending = false

  const connect = () => {
    if (port || stopped) return
    pending = false
    const started = timers.now()
    let current: PortLike
    try {
      current = api.runtime.connectNative(NATIVE_HOST)
    } catch (error) {
      onClosed(errorMessage(error), started)
      return
    }
    port = current
    current.onMessage.addListener((message) => {
      if (!isBridgeRequest(message)) return
      failures = 0
      void handleRequest(api, message).then((reply) => {
        try {
          current.postMessage(reply)
        } catch (error) {
          console.warn("Agent bridge: reply failed", error)
        }
      })
    })
    current.onDisconnect.addListener(() => {
      if (port !== current) return
      port = null
      onClosed(api.runtime.lastError?.message, started)
    })
  }

  const onClosed = (message: string | undefined, started: number) => {
    if (isFatalDisconnect(message)) {
      stopped = true
      return
    }
    if (timers.now() - started > STABLE_MS) failures = 0
    failures += 1
    if (failures >= MAX_FAILURES) {
      stopped = true
      return
    }
    if (pending) return
    pending = true
    timers.setTimeout(connect, backoffDelay(failures))
  }

  const start = async () => {
    const granted = await api.permissions.contains({ permissions: ["nativeMessaging"] })
    if (!granted) return
    stopped = false
    failures = 0
    connect()
  }

  return {
    start,
    state: () => ({ connected: port !== null, failures, stopped })
  }
}

export const AGENT_BRIDGE_START = "AGENT_BRIDGE_START"

export const isBridgeStartMessage = (message: unknown): boolean =>
  record(message).type === AGENT_BRIDGE_START

// Restart the bridge after a fatal stop (host not found, too many failures).
// Returns true when the message was handled.
export const handleBridgeStartMessage = (
  bridge: { start: () => Promise<void> },
  message: unknown,
  sendResponse: (response: unknown) => void
): boolean => {
  if (!isBridgeStartMessage(message)) return false
  bridge
    .start()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }))
  return true
}

export const startAgentBridge = (api: BridgeChrome) => {
  const bridge = createBridge(api)
  api.permissions.onAdded?.addListener(() => {
    void bridge.start()
  })
  api.runtime.onStartup?.addListener(() => {
    void bridge.start()
  })
  void bridge.start()
  return bridge
}
