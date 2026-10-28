import {
  attachImagesToEditor,
  clickSendWhenReady,
  setContentEditableText,
  waitForFirstMatchingElement,
  type ImagePayload
} from "~/contents/lib/dom-helpers"
import { createResponseCapture } from "~/contents/lib/response-observer"

const RESPONSE_SELECTORS = [
  "div.prose",
  "div[class*='prose']",
  "[class*='markdown']",
  "main .scrollable-container div[dir='auto'] p",
  ".scrollable-container [class*='whitespace-pre']",
  ".scrollable-container [class*='font-serif']",
  "main article"
]

const SEND_BUTTON_SELECTORS = [
  "button[aria-label='Submit']",
  "button[aria-label='Submit question']",
  "button[aria-label='Send']",
  "button[type='submit']",
  "button.bg-super",
  "button:has(svg[data-icon='arrow-right'])",
  "button:has(svg.lucide-arrow-right)"
]

const { ensureObserver, setActiveSession } = createResponseCapture(
  "perplexity",
  RESPONSE_SELECTORS
)

const findPerplexityInput = async (): Promise<HTMLElement | null> => {
  const direct = await waitForFirstMatchingElement<HTMLElement>(
    [
      "div#ask-input[contenteditable='true']",
      "div[data-lexical-editor='true'][contenteditable='true']",
      "div[contenteditable='true']"
    ],
    3000
  )
  if (direct) {
    return direct
  }

  const lexicalContainers = Array.from(
    document.querySelectorAll("[data-lexical-editor='true']")
  )
  for (const container of lexicalContainers) {
    if (container instanceof HTMLElement) {
      return container
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

  const textareas = Array.from(document.querySelectorAll("textarea"))
  if (textareas.length > 0) {
    return textareas[0]
  }

  return null
}

const fillPerplexityInput = async (
  prompt: string,
  sessionId?: string,
  autoSend = true,
  images?: ImagePayload[]
) => {
  setActiveSession(sessionId)

  const input = await findPerplexityInput()

  if (!input) {
    return
  }

  if (images && images.length > 0) {
    const attached = await attachImagesToEditor(input, images)
    if (!attached) {
      console.warn(
        `10x Chat: Perplexity did not confirm ${images.length} image attachment(s); sending prompt anyway`
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
      (input.closest("[data-ask-input-container]") ??
        input.closest("form") ??
        document) as Document | Element
    await clickSendWhenReady(container, input, SEND_BUTTON_SELECTORS, 5000)
  }
}

export default defineContentScript({
  matches: ["https://www.perplexity.ai/*", "https://perplexity.ai/*"],
  runAt: "document_end",
  main() {
    ensureObserver()

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SET_PROMPT" && typeof message.prompt === "string") {
        ensureObserver()
        fillPerplexityInput(
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
