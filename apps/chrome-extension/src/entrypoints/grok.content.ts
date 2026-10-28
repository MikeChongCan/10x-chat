import {
  attachImagesToEditor,
  clickSendWhenReady,
  setContentEditableText,
  waitForFirstMatchingElement,
  type ImagePayload
} from "~/contents/lib/dom-helpers"
import { createResponseCapture } from "~/contents/lib/response-observer"

const RESPONSE_SELECTORS = [
  "div[data-testid='assistant-message'] .response-content-markdown",
  "div[data-testid='assistant-message']",
  "div[data-testid='response']",
  "main article"
]

const SEND_BUTTON_SELECTORS = [
  "button[data-testid='chat-submit']",
  "button[aria-label='Submit']",
  "button[aria-label='Send']"
]

const { ensureObserver, setActiveSession } = createResponseCapture(
  "grok",
  RESPONSE_SELECTORS
)

const findGrokInput = async (): Promise<HTMLElement | null> => {
  const direct = await waitForFirstMatchingElement<HTMLElement>(
    [
      "div.tiptap.ProseMirror[contenteditable='true']",
      "div[contenteditable='true'].ProseMirror",
      "div[contenteditable='true']"
    ],
    3000
  )
  if (direct) {
    return direct
  }

  const forms = Array.from(document.querySelectorAll("form"))
  for (const form of forms) {
    const editable = form.querySelector<HTMLElement>(
      "[contenteditable='true']"
    )
    if (editable) {
      return editable
    }
  }

  const allEditables = Array.from(
    document.querySelectorAll<HTMLElement>("[contenteditable='true']")
  )
  if (allEditables.length > 0) {
    const visible = allEditables.find((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    if (visible) {
      return visible
    }
    return allEditables[allEditables.length - 1]
  }

  return null
}

const fillGrokInput = async (
  prompt: string,
  sessionId?: string,
  autoSend = true,
  images?: ImagePayload[]
) => {
  setActiveSession(sessionId)

  const input = await findGrokInput()

  if (!input) {
    return
  }

  if (images && images.length > 0) {
    const attached = await attachImagesToEditor(input, images)
    if (!attached) {
      console.warn(
        `10x Chat: Grok did not confirm ${images.length} image attachment(s); sending prompt anyway`
      )
    }
  }

  if (input instanceof HTMLTextAreaElement) {
    input.focus()
    input.value = prompt
    input.dispatchEvent(new Event("input", { bubbles: true }))
  } else {
    setContentEditableText(input, prompt)
  }

  if (autoSend) {
    await new Promise((r) => setTimeout(r, 300))
    const container =
      (input.closest("form") ?? document) as Document | Element
    await clickSendWhenReady(container, input, SEND_BUTTON_SELECTORS, 5000)
  }
}

export default defineContentScript({
  matches: ["https://grok.com/*"],
  runAt: "document_end",
  main() {
    ensureObserver()

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SET_PROMPT" && typeof message.prompt === "string") {
        ensureObserver()
        fillGrokInput(
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
