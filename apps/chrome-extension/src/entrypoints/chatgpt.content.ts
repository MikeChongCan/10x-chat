import {
  attachImagesToEditor,
  clickSendWhenReady,
  dispatchInputEvents,
  setContentEditableText,
  setNativeValue,
  waitForElement,
  waitForFirstMatchingElement,
  type ImagePayload
} from "~/contents/lib/dom-helpers"
import { createResponseCapture } from "~/contents/lib/response-observer"

const DEFAULT_WAIT_TIMEOUT_MS = 30_000

const RESPONSE_SELECTORS = [
  "[data-markdown-text-style='assistant-message']",
  "[data-message-author-role='assistant']",
  "article[data-testid='conversation-turn'] div[data-testid='markdown']",
  "article[data-testid^='conversation-turn'] [data-message-author-role='assistant']",
  "div[data-testid='assistant-turn']",
  "div[data-message-author-role='assistant'] .markdown",
  "[data-testid^='conversation-turn-'] [data-message-author-role='assistant']",
  ".agent-turn [data-message-author-role='assistant']"
]

const SEND_BUTTON_SELECTORS = [
  "button[data-testid='send-button']",
  "button[type='submit']",
  "button[aria-label='Send']",
  "button[aria-label='Send prompt']",
  "button[aria-label='Send message']",
  "button[aria-label*='Send' i]",
  "button[aria-label*='发送' i]"
]

const { ensureObserver, setActiveSession } = createResponseCapture(
  "chatgpt",
  RESPONSE_SELECTORS
)

const waitForElementIn = <T extends Element>(
  root: Document | Element,
  selector: string,
  timeout = DEFAULT_WAIT_TIMEOUT_MS
): Promise<T | null> => {
  return new Promise((resolve) => {
    const immediate = root.querySelector(selector) as T | null
    if (immediate) {
      resolve(immediate)
      return
    }
    const observer = new MutationObserver(() => {
      const element = root.querySelector(selector) as T | null
      if (element) {
        observer.disconnect()
        resolve(element)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

const CHATGPT_EDITOR_SELECTORS = [
  "div.ProseMirror[contenteditable='true']",
  "div#prompt-textarea[contenteditable='true'].ProseMirror",
  "div#prompt-textarea[contenteditable='true']",
  "[contenteditable='true'].ProseMirror#prompt-textarea",
  "div[data-composer-markdown][contenteditable='true']",
  "div[role='textbox'][contenteditable='true']",
  "[data-composer-body] [contenteditable='true']",
  "form [contenteditable='true']",
  "form textarea",
  "textarea"
]

const fillChatgptInput = async (
  prompt: string,
  sessionId?: string,
  autoSend = true,
  images?: ImagePayload[]
) => {
  setActiveSession(sessionId)

  const editor = await waitForFirstMatchingElement<HTMLElement>(
    CHATGPT_EDITOR_SELECTORS
  )

  if (!editor) {
    return
  }

  if (images && images.length > 0 && editor instanceof HTMLElement) {
    const attached = await attachImagesToEditor(editor, images)
    if (!attached) {
      console.warn(
        `10x Chat: ChatGPT did not confirm ${images.length} image attachment(s); sending prompt anyway`
      )
    }
  }

  if (editor instanceof HTMLTextAreaElement) {
    editor.focus()
    setNativeValue(editor, prompt)
    dispatchInputEvents(editor)
  } else {
    setContentEditableText(editor as HTMLElement, prompt)
  }

  if (autoSend) {
    const container = (editor.closest("form") ??
      editor.closest("[data-composer-body]") ??
      editor.closest("[data-composer-surface]") ??
      editor.closest("[class*='composer']") ??
      document) as Document | Element
    await clickSendWhenReady(container, editor, SEND_BUTTON_SELECTORS)
  }
}

export default defineContentScript({
  matches: ["https://chatgpt.com/*", "https://www.chatgpt.com/*"],
  runAt: "document_end",
  main() {
    ensureObserver()

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SET_PROMPT" && typeof message.prompt === "string") {
        ensureObserver()
        fillChatgptInput(
          message.prompt,
          message.sessionId,
          message.autoSend !== false,
          message.images
        )
        sendResponse({ success: true })
        return true
      }
      return false
    })

    window.addEventListener("load", () => {
      ensureObserver()
    })
  }
})
