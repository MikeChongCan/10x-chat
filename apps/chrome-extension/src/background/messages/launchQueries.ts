import type { ImagePayload } from "~/contents/lib/dom-helpers"
import type { MessagePayload, MessageResponse } from "~/lib/messaging"

import {
  createIntegrationSession,
  type ServiceType
} from "../integration-session"

const MANAGED_KEY = "extensionManagedIds"
const SERVICE_TAB_KEY = "serviceTabMap"

type ServiceTabEntry = {
  service: ServiceType
  tabId: number
}

type ManagedIds = {
  tabs: number[]
  groups: number[]
}

type ServiceTabMap = Partial<Record<ServiceType, number>>

type ServiceTask = ServiceTabEntry & {
  prompt: string
  images?: ImagePayload[]
}

type ServiceLaunchConfig = {
  type: ServiceType
  url: string
  query?: string
  images?: ImagePayload[]
  enabled: boolean
}

const getServiceTabMap = async (): Promise<ServiceTabMap> => {
  const result = await chrome.storage.session.get(SERVICE_TAB_KEY)
  const stored = result[SERVICE_TAB_KEY] as ServiceTabMap | undefined
  if (!stored) {
    return {}
  }
  return stored
}

const trackItems = async (
  newTabIds: number[] = [],
  newGroupIds: number[] = [],
  serviceTabs: ServiceTabEntry[] = [],
  baseServiceMap?: ServiceTabMap
) => {
  if (!chrome.storage?.session?.get || !chrome.storage?.session?.set) {
    return
  }
  const currentIds = await chrome.storage.session.get(MANAGED_KEY)
  const managedIds = (currentIds[MANAGED_KEY] as ManagedIds | undefined) || {
    tabs: [],
    groups: []
  }
  const updatedTabs = Array.from(new Set([...managedIds.tabs, ...newTabIds]))
  const updatedGroups = Array.from(
    new Set([...managedIds.groups, ...newGroupIds])
  )
  const baseMap = baseServiceMap ?? (await getServiceTabMap())
  const nextServiceMap: ServiceTabMap = { ...baseMap }
  serviceTabs.forEach(({ service, tabId }) => {
    nextServiceMap[service] = tabId
  })
  await chrome.storage.session.set({
    [MANAGED_KEY]: {
      tabs: updatedTabs,
      groups: updatedGroups
    },
    [SERVICE_TAB_KEY]: nextServiceMap
  })
}

const closePreviousItems = async () => {
  if (!chrome.storage?.session?.get || !chrome.storage?.session?.remove) {
    return
  }
  const result = await chrome.storage.session.get([
    MANAGED_KEY,
    SERVICE_TAB_KEY
  ])
  const managedIds = result[MANAGED_KEY] as ManagedIds | undefined
  if (
    !managedIds ||
    (managedIds.tabs.length === 0 && managedIds.groups.length === 0)
  ) {
    await chrome.storage.session.remove([MANAGED_KEY, SERVICE_TAB_KEY])
    return
  }
  const tabIdsToClose = new Set<number>(managedIds.tabs)
  if (managedIds.groups && managedIds.groups.length > 0) {
    const groupQueryPromises = managedIds.groups.map((groupId: number) =>
      chrome.tabs.query({ groupId }).catch(() => [])
    )
    const tabsInGroups = (await Promise.all(groupQueryPromises)).flat()
    tabsInGroups.forEach((tab) => {
      if (tab.id !== undefined) {
        tabIdsToClose.add(tab.id)
      }
    })
  }
  const closingPromises = Array.from(tabIdsToClose).map((tabId) =>
    chrome.tabs.remove(tabId).catch((error) => {
      console.log(`Could not remove tab ${tabId}: ${error.message}`)
    })
  )
  await Promise.all(closingPromises)
  await chrome.storage.session.remove([MANAGED_KEY, SERVICE_TAB_KEY])
}

const sendPromptToContent = async (
  tabId: number,
  service: ServiceType,
  prompt: string,
  sessionId?: string,
  images?: ImagePayload[]
) => {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "SET_PROMPT",
      prompt,
      images,
      autoSend: true,
      service,
      sessionId
    })
  } catch (error) {
    console.error(
      `Background: Failed to deliver prompt to ${service} tab ${tabId}`,
      error
    )
  }
}

const schedulePromptDelivery = (
  tabId: number,
  service: ServiceType,
  prompt: string,
  sessionId: string | undefined,
  hostMatch: string,
  images?: ImagePayload[]
) => {
  const listener = (
    updatedTabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    updatedTab: chrome.tabs.Tab
  ) => {
    if (updatedTabId !== tabId || changeInfo.status !== "complete") {
      return
    }
    if (updatedTab.url && !updatedTab.url.includes(hostMatch)) {
      return
    }
    chrome.tabs.onUpdated.removeListener(listener)

    // Activate both the tab AND its window before sending the prompt so that
    // .focus(), execCommand, and window.getSelection() work in the content script.
    void focusExistingTab(tabId).then(() => {
      setTimeout(() => {
        if (service === "gemini" && sessionId === undefined) {
          void chrome.tabs.sendMessage(tabId, {
            type: "FILL_GEMINI_PROMPT",
            prompt,
            images,
            autoSend: true
          })
        } else {
          void sendPromptToContent(tabId, service, prompt, sessionId, images)
        }
      }, 500)
    }).catch(() => {
      // Tab or window might have been closed — send anyway as fallback
      setTimeout(() => {
        void sendPromptToContent(tabId, service, prompt, sessionId, images)
      }, 500)
    })
  }
  chrome.tabs.onUpdated.addListener(listener)
}

const focusExistingTab = async (tabId: number) => {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true })
    }
    await chrome.tabs.update(tabId, { active: true })
  } catch (error) {
    console.error(`Background: Unable to focus tab ${tabId}`, error)
  }
}

const handler = async (
  req: MessagePayload<{
    query?: string
    closePreviousTabs?: boolean
    queries?: Record<string, string>
    closePrevious?: boolean
    continuous?: boolean
    integration?: boolean
    sessionId?: string
    mode?: "tabGroup" | "windows" | "tabs"
    images?: ImagePayload[]
    services?: ServiceType[]
  }>,
  res?: MessageResponse<{ status: string; message: string }>
) => {
  const query = req.body?.query
  const images = req.body?.images
  const closePreviousTabs = req.body?.closePreviousTabs === true

  if (typeof query !== "string" || query.trim().length === 0) {
    if (res && typeof res.send === "function") {
      try {
        res.send({ status: "error", message: "Invalid query" })
      } catch (error) {
        console.error("Background: Error sending error response:", error)
      }
    }
    return
  }

  const defaultServices: Record<ServiceType, boolean> = {
    chatgpt: true,
    grok: true,
    gemini: true,
    perplexity: true,
    claude: true
  }

  const result = await chrome.storage.sync.get(["enabledServices"])
  const enabledServices =
    (result.enabledServices as Record<ServiceType, boolean> | undefined) ||
    defaultServices

  const allServices: ServiceLaunchConfig[] = [
    {
      type: "chatgpt",
      url: "https://chatgpt.com/",
      query,
      images,
      enabled: enabledServices.chatgpt
    },
    {
      type: "grok",
      url: "https://grok.com/",
      query,
      images,
      enabled: enabledServices.grok
    },
    {
      type: "gemini",
      url: "https://gemini.google.com/app",
      query,
      images,
      enabled: enabledServices.gemini
    },
    {
      type: "perplexity",
      url: "https://www.perplexity.ai/",
      query,
      images,
      enabled: enabledServices.perplexity
    },
    {
      type: "claude",
      url: "https://claude.ai/new",
      query,
      images,
      enabled: enabledServices.claude
    }
  ]

  const requestedServices = Array.isArray(req.body?.services) ? req.body.services : []
  const services = allServices.filter(
    (service) =>
      service.enabled &&
      (requestedServices.length === 0 || requestedServices.includes(service.type))
  )

  if (services.length === 0) {
    if (res && typeof res.send === "function") {
      try {
        res.send({ status: "error", message: "No services enabled" })
      } catch (error) {
        console.error("Background: Error sending error response:", error)
      }
    }
    return
  }

  const preferencesResult = await chrome.storage.sync.get([
    "launchMode",
    "useTabGroups",
    "continuousMode",
    "integrationMode"
  ])
  const useTabGroups = preferencesResult.useTabGroups !== false
  let effectiveLaunchMode =
    (preferencesResult.launchMode as
      | "tabGroup"
      | "windows"
      | "tabs"
      | undefined) || "tabGroup"
  if (!useTabGroups && effectiveLaunchMode === "tabGroup") {
    effectiveLaunchMode = "tabs"
  }
  const continuousMode = preferencesResult.continuousMode === true
  const integrationMode = preferencesResult.integrationMode === true

  if (closePreviousTabs && !continuousMode) {
    await closePreviousItems()
  }

  let sessionId: string | undefined
  if (integrationMode) {
    sessionId = await createIntegrationSession(
      query,
      services.map((service) => service.type)
    )
  }

  let serviceMap: ServiceTabMap = {}
  const baseServiceMap: ServiceTabMap = {}
  const reusedTasks: ServiceTask[] = []
  const pendingServices: ServiceLaunchConfig[] = []

  if (continuousMode) {
    serviceMap = await getServiceTabMap()
    for (const item of services) {
      const tabId = serviceMap[item.type]
      if (tabId !== undefined) {
        try {
          const existingTab = await chrome.tabs.get(tabId)
          if (existingTab && existingTab.id !== undefined) {
            reusedTasks.push({
              service: item.type,
              tabId: existingTab.id,
              prompt: item.query ?? query,
              images: item.images ?? images
            })
            baseServiceMap[item.type] = existingTab.id
            continue
          }
        } catch (error) {
          console.warn(
            `Background: Stored tab for ${item.type} is unavailable`,
            error
          )
        }
      }
      pendingServices.push(item)
    }
  } else {
    pendingServices.push(...services)
  }

  for (const reused of reusedTasks) {
    await focusExistingTab(reused.tabId)
    await sendPromptToContent(
      reused.tabId,
      reused.service,
      reused.prompt,
      sessionId,
      reused.images
    )
  }

  const createdTabIds: number[] = []
  const createdServiceEntries: ServiceTabEntry[] = []
  let createdGroupId: number | null = null

  if (pendingServices.length > 0) {
    if (effectiveLaunchMode === "tabGroup") {
      for (const item of pendingServices) {
        try {
          const tab = await chrome.tabs.create({ url: item.url })
          if (tab && tab.id !== undefined) {
            createdTabIds.push(tab.id)
            createdServiceEntries.push({ service: item.type, tabId: tab.id })
            const host = new URL(item.url).host
            schedulePromptDelivery(
              tab.id,
              item.type,
              item.query ?? query,
              sessionId,
              host,
              item.images ?? images
            )
          }
        } catch (error) {
          console.error(`Background: Error creating tab for ${item.url}`, error)
        }
      }
      if (createdTabIds.length > 0) {
        try {
          createdGroupId = await chrome.tabs.group({ tabIds: createdTabIds })
          await chrome.tabGroups.update(createdGroupId, {
            collapsed: false,
            title: `AI Query: ${query.substring(0, 20)}${query.length > 20 ? "..." : ""}`,
            color: "purple"
          })
        } catch (error) {
          console.error("Background: Error creating tab group", error)
          createdGroupId = null
        }
      }
    } else if (effectiveLaunchMode === "windows") {
      const displays = await chrome.system.display.getInfo()
      const primaryDisplay =
        displays.find((display) => display.isPrimary) || displays[0]
      const numServices = pendingServices.length
      const cols = Math.min(3, Math.ceil(Math.sqrt(numServices)))
      const rows = Math.ceil(numServices / cols)
      const windowWidth = Math.floor(primaryDisplay.workArea.width / cols)
      const windowHeight = Math.floor(primaryDisplay.workArea.height / rows)
      for (let index = 0; index < pendingServices.length; index += 1) {
        const item = pendingServices[index]
        const col = index % cols
        const row = Math.floor(index / cols)
        try {
          const createdWindow = await chrome.windows.create({
            url: item.url,
            left: primaryDisplay.workArea.left + col * windowWidth,
            top: primaryDisplay.workArea.top + row * windowHeight,
            width: windowWidth,
            height: windowHeight,
            type: "normal"
          })
          const tab = createdWindow.tabs && createdWindow.tabs[0]
          if (tab && tab.id !== undefined) {
            createdTabIds.push(tab.id)
            createdServiceEntries.push({ service: item.type, tabId: tab.id })
            const host = new URL(item.url).host
            schedulePromptDelivery(
              tab.id,
              item.type,
              item.query ?? query,
              sessionId,
              host,
              item.images ?? images
            )
          }
        } catch (error) {
          console.error(
            `Background: Error creating window for ${item.url}`,
            error
          )
        }
      }
    } else {
      for (const item of pendingServices) {
        try {
          const tab = await chrome.tabs.create({ url: item.url })
          if (tab && tab.id !== undefined) {
            createdTabIds.push(tab.id)
            createdServiceEntries.push({ service: item.type, tabId: tab.id })
            const host = new URL(item.url).host
            schedulePromptDelivery(
              tab.id,
              item.type,
              item.query ?? query,
              sessionId,
              host,
              item.images ?? images
            )
          }
        } catch (error) {
          console.error(`Background: Error creating tab for ${item.url}`, error)
        }
      }
    }
  }

  const reusedEntries = reusedTasks.map<ServiceTabEntry>(
    ({ service, tabId }) => ({ service, tabId })
  )
  const groupIds = createdGroupId ? [createdGroupId] : []
  if (createdTabIds.length > 0 || reusedEntries.length > 0) {
    await trackItems(
      createdTabIds,
      groupIds,
      [...reusedEntries, ...createdServiceEntries],
      baseServiceMap
    )
  }

  if (res && typeof res.send === "function") {
    try {
      res.send({ status: "success", message: "Tabs launch initiated" })
    } catch (error) {
      console.error("Background: Error sending success response:", error)
    }
  } else {
    console.warn(
      "Background: res object or res.send function not available for success response."
    )
  }
}

export default handler
