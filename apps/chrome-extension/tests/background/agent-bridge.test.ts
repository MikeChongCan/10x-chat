import {
  backoffDelay,
  type BridgeChrome,
  type BridgeTab,
  createBridge,
  handleBridgeStartMessage,
  handleRequest,
  isFatalDisconnect,
  startAgentBridge,
  type PortLike,
  type UserScriptInjection,
  type UserScriptResult,
  wrapCode
} from "../../src/background/agent-bridge"

type FakeOptions = {
  tabs?: BridgeTab[]
  userScripts?: "on" | "missing" | "blocked"
  execute?: (injection: UserScriptInjection) => Promise<UserScriptResult[]>
  allUrls?: boolean
  nativeMessaging?: boolean
}

const fakeChrome = (options: FakeOptions = {}) => {
  const tabs = new Map<number, BridgeTab>()
  for (const tab of options.tabs ?? []) if (tab.id !== undefined) tabs.set(tab.id, tab)
  let nextId = 100
  const ports: FakePort[] = []
  const api: BridgeChrome = {
    runtime: {
      getManifest: () => ({ version: "9.9.9" }),
      connectNative: jest.fn(() => {
        const port = new FakePort()
        ports.push(port)
        return port
      }),
      lastError: undefined
    },
    permissions: {
      contains: jest.fn(async (query: { permissions?: string[]; origins?: string[] }) => {
        if (query.origins) return options.allUrls ?? false
        return options.nativeMessaging ?? true
      })
    },
    tabs: {
      query: jest.fn(async () => [...tabs.values()]),
      create: jest.fn(async ({ url, active }: { url: string; active: boolean }) => {
        const tab: BridgeTab = { id: nextId++, url, active, status: "complete", windowId: 1 }
        tabs.set(tab.id as number, tab)
        return tab
      }),
      get: jest.fn(async (tabId: number) => {
        const tab = tabs.get(tabId)
        if (!tab) throw new Error(`No tab with id: ${tabId}.`)
        return tab
      }),
      update: jest.fn(async (tabId: number) => tabs.get(tabId)),
      remove: jest.fn(async (tabId: number) => {
        tabs.delete(tabId)
      })
    },
    windows: { update: jest.fn(async () => ({})) }
  }
  if (options.userScripts !== "missing") {
    api.userScripts = {
      execute:
        options.execute ?? jest.fn(async () => [{ result: { ok: true } }] as UserScriptResult[]),
      getScripts: jest.fn(async () => {
        if (options.userScripts === "blocked") throw new Error("User scripts API is not available")
        return []
      })
    }
  }
  return { api, tabs, ports }
}

class FakePort implements PortLike {
  messages: unknown[] = []
  private messageListeners: ((message: unknown) => void)[] = []
  private disconnectListeners: (() => void)[] = []
  postMessage(message: unknown) {
    this.messages.push(message)
  }
  onMessage = { addListener: (listener: (message: unknown) => void) => this.messageListeners.push(listener) }
  onDisconnect = { addListener: (listener: () => void) => this.disconnectListeners.push(listener) }
  emit(message: unknown) {
    for (const listener of this.messageListeners) listener(message)
  }
  closed = false
  disconnect() {
    this.closed = true
    for (const listener of this.disconnectListeners) listener()
  }
}

const call = (api: BridgeChrome, method: string, params?: unknown) =>
  handleRequest(api, { id: 1, method, params }, { newPageTimeoutMs: 50 })

describe("agent bridge handlers", () => {
  it("ping reports version, user scripts, and all urls", async () => {
    const { api } = fakeChrome({ allUrls: true })
    expect(await call(api, "ping")).toEqual({
      id: 1,
      ok: true,
      result: { version: "9.9.9", userScripts: true, allUrls: true }
    })
  })

  it("ping reports userScripts false when blocked or missing", async () => {
    for (const mode of ["blocked", "missing"] as const) {
      const { api } = fakeChrome({ userScripts: mode })
      const reply = await call(api, "ping")
      expect(reply).toMatchObject({ ok: true, result: { userScripts: false, allUrls: false } })
    }
  })

  it("list_pages maps tabs to t ids", async () => {
    const { api } = fakeChrome({
      tabs: [
        { id: 4, url: "https://a.test/", title: "A", active: true },
        { id: 7, url: "https://b.test/", title: "B", active: false }
      ]
    })
    const reply = await call(api, "list_pages")
    expect(reply).toEqual({
      id: 1,
      ok: true,
      result: [
        { id: "t4", tabId: 4, url: "https://a.test/", title: "A", active: true },
        { id: "t7", tabId: 7, url: "https://b.test/", title: "B", active: false }
      ]
    })
    expect(api.tabs.query).toHaveBeenCalledWith({ windowType: "normal" })
  })

  it("new_page creates a background tab and waits for complete", async () => {
    const { api, tabs } = fakeChrome()
    ;(api.tabs.create as jest.Mock).mockImplementationOnce(async ({ url, active }) => {
      const tab: BridgeTab = { id: 5, url, active, status: "loading" }
      tabs.set(5, tab)
      setTimeout(() => tabs.set(5, { ...tab, status: "complete", url: "https://x.test/done" }), 10)
      return tab
    })
    const reply = await call(api, "new_page", { url: "https://x.test/", background: true })
    expect(api.tabs.create).toHaveBeenCalledWith({ url: "https://x.test/", active: false })
    expect(reply).toEqual({
      id: 1,
      ok: true,
      result: { tabId: 5, id: "t5", url: "https://x.test/done" }
    })
  })

  it("new_page returns after the timeout when the tab never completes", async () => {
    const { api, tabs } = fakeChrome()
    ;(api.tabs.create as jest.Mock).mockImplementationOnce(async ({ url, active }) => {
      const tab: BridgeTab = { id: 6, url, active, status: "loading" }
      tabs.set(6, tab)
      return tab
    })
    const reply = await call(api, "new_page", { url: "https://slow.test/" })
    expect(api.tabs.create).toHaveBeenCalledWith({ url: "https://slow.test/", active: true })
    expect(reply).toMatchObject({ ok: true, result: { tabId: 6, id: "t6" } })
  })

  const runInPage = jest.fn(async (injection: UserScriptInjection) => [
    { result: await (0, eval)(injection.js[0].code) }
  ] as UserScriptResult[])

  it("evaluate runs code in the MAIN world and returns its awaited value", async () => {
    const { api } = fakeChrome({ tabs: [{ id: 3 }], execute: runInPage })
    const reply = await call(api, "evaluate", {
      tabId: 3,
      code: "(async (a) => ({n: a + 1}))(JSON.parse(\"1\"))"
    })
    expect(runInPage).toHaveBeenCalledWith({
      target: { tabId: 3 },
      world: "MAIN",
      js: [{ code: wrapCode("(async (a) => ({n: a + 1}))(JSON.parse(\"1\"))") }]
    })
    expect(reply).toEqual({ id: 1, ok: true, result: { n: 2 } })
  })

  it("evaluate returns eval_error when the page code throws or rejects", async () => {
    const { api } = fakeChrome({ tabs: [{ id: 3 }], execute: runInPage })
    for (const code of ["(() => { throw new Error('boom') })()", "(async () => { throw new Error('late') })()"]) {
      const reply = await call(api, "evaluate", { tabId: 3, code })
      expect(reply).toMatchObject({ ok: false, error: { code: "eval_error" } })
      if (!reply.ok) expect(reply.error.message).toMatch(/boom|late/)
    }
  })

  it("evaluate returns user_scripts_off when the API is missing", async () => {
    const { api } = fakeChrome({ tabs: [{ id: 3 }], userScripts: "missing" })
    const reply = await call(api, "evaluate", { tabId: 3, code: "1" })
    expect(reply).toMatchObject({ ok: false, error: { code: "user_scripts_off" } })
    if (!reply.ok) expect(reply.error.message).toContain("Allow User Scripts")
  })

  it("evaluate returns tab_gone for a missing tab", async () => {
    const { api } = fakeChrome()
    expect(await call(api, "evaluate", { tabId: 9, code: "1" })).toMatchObject({
      ok: false,
      error: { code: "tab_gone" }
    })
  })

  it("evaluate returns eval_error when the script throws", async () => {
    const execute = jest.fn(async () => {
      throw new Error("Uncaught ReferenceError: nope is not defined")
    })
    const { api } = fakeChrome({ tabs: [{ id: 3 }], execute })
    const reply = await call(api, "evaluate", { tabId: 3, code: "nope" })
    expect(reply).toEqual({
      id: 1,
      ok: false,
      error: { code: "eval_error", message: "Uncaught ReferenceError: nope is not defined" }
    })
  })

  it("evaluate returns eval_error for a result error", async () => {
    const execute = jest.fn(async () => [{ error: "boom" }] as UserScriptResult[])
    const { api } = fakeChrome({ tabs: [{ id: 3 }], execute })
    expect(await call(api, "evaluate", { tabId: 3, code: "x" })).toMatchObject({
      ok: false,
      error: { code: "eval_error", message: "boom" }
    })
  })

  it("select_page activates the tab and focuses its window", async () => {
    const { api } = fakeChrome({ tabs: [{ id: 2, windowId: 8 }] })
    expect(await call(api, "select_page", { tabId: 2 })).toMatchObject({ ok: true })
    expect(api.tabs.update).toHaveBeenCalledWith(2, { active: true })
    expect(api.windows.update).toHaveBeenCalledWith(8, { focused: true })
  })

  it("close_page removes the tab", async () => {
    const { api, tabs } = fakeChrome({ tabs: [{ id: 2 }] })
    expect(await call(api, "close_page", { tabId: 2 })).toMatchObject({ ok: true })
    expect(tabs.has(2)).toBe(false)
  })

  it("select_page and close_page return tab_gone for a missing tab", async () => {
    const { api } = fakeChrome()
    for (const method of ["select_page", "close_page"]) {
      expect(await call(api, method, { tabId: 1 })).toMatchObject({
        ok: false,
        error: { code: "tab_gone" }
      })
    }
  })

  it("unknown methods fail", async () => {
    const { api } = fakeChrome()
    expect(await call(api, "nope")).toMatchObject({ ok: false, error: { code: "unknown_method" } })
  })
})

describe("agent bridge connection", () => {
  const manualTimers = () => {
    let time = 0
    const queue: { at: number; cb: () => void }[] = []
    return {
      timers: {
        now: () => time,
        setTimeout: (cb: () => void, ms: number) => {
          queue.push({ at: time + ms, cb })
        }
      },
      runNext: () => {
        queue.sort((a, b) => a.at - b.at)
        const next = queue.shift()
        if (!next) return false
        time = next.at
        next.cb()
        return true
      },
      advance: (ms: number) => {
        time += ms
      },
      pending: () => queue.length
    }
  }

  it("uses exponential backoff with a 60s cap", () => {
    expect([1, 2, 3, 4, 7, 10].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000, 60000, 60000])
  })

  it("treats host not found and forbidden as fatal", () => {
    expect(isFatalDisconnect("Specified native messaging host not found.")).toBe(true)
    expect(isFatalDisconnect("Access to the specified native messaging host is forbidden.")).toBe(true)
    expect(isFatalDisconnect("Native host has exited.")).toBe(false)
  })

  it("starts on browser startup and when permissions are added", () => {
    const { api } = fakeChrome({ nativeMessaging: false })
    const onStartup = { addListener: jest.fn() }
    const onAdded = { addListener: jest.fn() }
    startAgentBridge({
      ...api,
      runtime: { ...api.runtime, onStartup },
      permissions: { ...api.permissions, onAdded }
    })
    expect(onStartup.addListener).toHaveBeenCalledTimes(1)
    expect(onAdded.addListener).toHaveBeenCalledTimes(1)
  })

  it("disconnects and stays stopped when bridge permissions are removed", async () => {
    const { api, ports } = fakeChrome()
    let granted = true
    let onRemoved: (() => void) | undefined
    const bridge = startAgentBridge({
      ...api,
      permissions: {
        ...api.permissions,
        contains: async () => granted,
        onRemoved: { addListener: (listener: () => void) => (onRemoved = listener) }
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(ports).toHaveLength(1)
    granted = false
    onRemoved?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(ports[0].closed).toBe(true)
    expect(bridge.state()).toMatchObject({ connected: false, stopped: true })
    expect(ports).toHaveLength(1)
  })

  it("does not connect without nativeMessaging", async () => {
    const { api } = fakeChrome({ nativeMessaging: false })
    await createBridge(api, manualTimers().timers).start()
    expect(api.runtime.connectNative).not.toHaveBeenCalled()
  })

  it("stops after 6 failures in a row", async () => {
    const { api, ports } = fakeChrome()
    const clock = manualTimers()
    const bridge = createBridge(api, clock.timers)
    await bridge.start()
    for (let i = 0; i < 10; i++) {
      ports[ports.length - 1]?.disconnect()
      if (!clock.runNext()) break
    }
    expect(api.runtime.connectNative).toHaveBeenCalledTimes(6)
    expect(bridge.state()).toMatchObject({ stopped: true, connected: false })
    expect(clock.pending()).toBe(0)
  })

  it("restarts after a stop on AGENT_BRIDGE_START", async () => {
    const { api, ports } = fakeChrome()
    const clock = manualTimers()
    const bridge = createBridge(api, clock.timers)
    await bridge.start()
    api.runtime.lastError = { message: "Specified native messaging host not found." }
    ports[0].disconnect()
    expect(bridge.state().stopped).toBe(true)
    api.runtime.lastError = undefined
    const sendResponse = jest.fn()
    expect(handleBridgeStartMessage(bridge, { type: "OTHER" }, sendResponse)).toBe(false)
    expect(handleBridgeStartMessage(bridge, { type: "AGENT_BRIDGE_START" }, sendResponse)).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
    expect(bridge.state()).toMatchObject({ stopped: false, connected: true, failures: 0 })
    expect(api.runtime.connectNative).toHaveBeenCalledTimes(2)
  })

  it("stops at once when the host is not found", async () => {
    const { api, ports } = fakeChrome()
    const clock = manualTimers()
    const bridge = createBridge(api, clock.timers)
    await bridge.start()
    api.runtime.lastError = { message: "Specified native messaging host not found." }
    ports[0].disconnect()
    expect(clock.pending()).toBe(0)
    expect(bridge.state().stopped).toBe(true)
  })

  it("resets the failure count after a long connection or a message", async () => {
    const { api, ports } = fakeChrome()
    const clock = manualTimers()
    const bridge = createBridge(api, clock.timers)
    await bridge.start()
    ports[0].disconnect()
    clock.runNext()
    ports[1].disconnect()
    clock.runNext()
    expect(bridge.state().failures).toBe(2)
    clock.advance(31_000)
    ports[2].disconnect()
    expect(bridge.state().failures).toBe(1)
    clock.runNext()
    ports[3].emit({ id: 1, method: "ping" })
    expect(bridge.state().failures).toBe(0)
  })

  it("replies to requests on the port", async () => {
    const { api, ports } = fakeChrome()
    await createBridge(api, manualTimers().timers).start()
    ports[0].emit({ id: 42, method: "list_pages" })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(ports[0].messages).toEqual([{ id: 42, ok: true, result: [] }])
  })
})
