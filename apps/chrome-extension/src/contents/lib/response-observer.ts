import type { ServiceName } from "./types"

type ResponseCaptureState = {
  activeSessionId: string | null
  observer: MutationObserver | null
  lastContent: string
}

/**
 * Extract the last matching response text from the page using a prioritised
 * list of CSS selectors. Returns `null` when no response content is found.
 */
const extractResponse = (selectors: string[]): string | null => {
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector))
    if (nodes.length === 0) {
      continue
    }
    const target = nodes[nodes.length - 1] as HTMLElement
    const text = (target.innerText ?? target.textContent)?.trim()
    if (text) {
      return text
    }
  }
  return null
}

/**
 * Create a response-capture context for a given AI service.
 *
 * Returns helpers that content scripts wire up in their message listener
 * and load event. The returned `ensureObserver` starts watching the DOM
 * for response mutations; `setActiveSession` links subsequent captures to
 * a background integration session.
 */
export const createResponseCapture = (
  service: ServiceName,
  responseSelectors: string[]
) => {
  const state: ResponseCaptureState = {
    activeSessionId: null,
    observer: null,
    lastContent: ""
  }

  const notify = (content: string) => {
    if (!state.activeSessionId) {
      return
    }
    if (content === state.lastContent) {
      return
    }
    state.lastContent = content
    chrome.runtime.sendMessage({
      type: "AI_RESPONSE_CAPTURED",
      service,
      content,
      sessionId: state.activeSessionId
    })
  }

  const ensureObserver = () => {
    if (state.observer) {
      return
    }
    state.observer = new MutationObserver(() => {
      const content = extractResponse(responseSelectors)
      if (content) {
        notify(content)
      }
    })
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    })
  }

  const setActiveSession = (sessionId?: string) => {
    state.activeSessionId = sessionId ?? null
    if (sessionId) {
      state.lastContent = ""
    }
  }

  return { ensureObserver, setActiveSession }
}
