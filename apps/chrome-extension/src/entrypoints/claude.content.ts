import {
  attachImagesToEditor,
  clickSendWhenReady,
  setContentEditableText,
  waitForFirstMatchingElement,
  type ImagePayload
} from "~/contents/lib/dom-helpers"
import { createResponseCapture } from "~/contents/lib/response-observer"

const RESPONSE_SELECTORS = [
  "div[data-testid='assistant-message'] div.prose",
  "div[data-testid='assistant-message']",
  "main article div[data-testid='markdown']",
  "main div.ProseMirror"
]

const SEND_BUTTON_SELECTORS = [
  "button[data-testid='chat-input-send']",
  "button[aria-label='Send message']",
  "button[aria-label='Send Message']",
  "button[aria-label='Send']"
]

const { ensureObserver, setActiveSession } = createResponseCapture(
  "claude",
  RESPONSE_SELECTORS
)

const fillClaudeInput = async (
  prompt: string,
  sessionId?: string,
  autoSend = true,
  images?: ImagePayload[]
) => {
  setActiveSession(sessionId)

  const editor = await waitForFirstMatchingElement<HTMLElement>([
    "div.ProseMirror[contenteditable='true']",
    "div[contenteditable='true']"
  ])
  if (!editor) {
    return
  }

  if (images && images.length > 0) {
    const attached = await attachImagesToEditor(editor, images)
    if (!attached) {
      console.warn(
        `10x Chat: Claude did not confirm ${images.length} image attachment(s); sending prompt anyway`
      )
    }
  }

  setContentEditableText(editor, prompt)

  if (autoSend) {
    await new Promise((r) => setTimeout(r, 300))
    const container =
      (editor.closest("form") ?? editor.closest("fieldset") ?? document) as
        | Document
        | Element
    await clickSendWhenReady(container, editor, SEND_BUTTON_SELECTORS, 5000)
  }
}

export default defineContentScript({
  matches: ["https://claude.ai/*"],
  runAt: "document_end",
  main() {
    ensureObserver()

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SET_PROMPT" && typeof message.prompt === "string") {
        ensureObserver()
        fillClaudeInput(
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
