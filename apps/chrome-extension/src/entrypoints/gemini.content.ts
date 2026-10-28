import {
  attachImagesToEditor,
  clickSendWhenReady,
  dispatchInputEvents,
  setContentEditableText,
  setNativeValue,
  type ImagePayload
} from "~/contents/lib/dom-helpers"
import { createResponseCapture } from "~/contents/lib/response-observer"

const DEFAULT_WAIT_TIMEOUT_MS = 30_000

const RESPONSE_SELECTORS = [
  "div.markdown",
  "article div.markdown",
  "div[data-response-content]"
]

const SEND_BUTTON_SELECTORS = [
  "gem-icon-button.send-button.submit button",
  "button:has(mat-icon[fonticon='arrow_upward'])",
  "button.send-button",
  "button[aria-label='Send message']",
  "button:has(mat-icon[fonticon='send'])",
  "button:has(mat-icon[data-mat-icon-name='send'])"
]

const UPLOAD_CONSENT_DIALOG_SELECTOR = "upload-image-disclaimer-dialog"
const UPLOAD_CONSENT_TIMEOUT_MS = 120_000
const ATTACHMENT_CHIP_SELECTOR = "img.gem-attachment-style-img"
const ATTACHMENT_CHIP_TIMEOUT_MS = 8_000
const INPUT_SETTLE_MS = 500

const { ensureObserver, setActiveSession } = createResponseCapture(
  "gemini",
  RESPONSE_SELECTORS
)

const findBestGeminiEditor = (): Element | null => {
  const quillEditors = Array.from(
    document.querySelectorAll(".ql-editor[contenteditable='true']")
  )
  if (quillEditors.length > 0) {
    const visibleQuill = quillEditors.find((editor) => {
      const rect = editor.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    return visibleQuill ?? quillEditors[quillEditors.length - 1]
  }

  const richTextContainers = Array.from(
    document.querySelectorAll(".rich-textarea, rich-textarea")
  )
  for (const container of richTextContainers) {
    const nestedEditable = container.querySelector(
      "[contenteditable='true'], textarea, input"
    )
    if (nestedEditable) {
      return nestedEditable
    }
  }

  const editables = Array.from(
    document.querySelectorAll(
      "div[contenteditable='true'], p[contenteditable='true']"
    )
  )
  if (editables.length > 0) {
    return editables[editables.length - 1]
  }

  const textareas = Array.from(document.querySelectorAll("textarea"))
  if (textareas.length > 0) {
    const visibleTextarea = textareas.find((area) => {
      const rect = area.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    return visibleTextarea ?? textareas[0]
  }

  return null
}

const waitForGeminiEditor = async (
  timeout = DEFAULT_WAIT_TIMEOUT_MS
): Promise<Element | null> => {
  const immediate = findBestGeminiEditor()
  if (immediate) {
    return immediate
  }

  return new Promise((resolve) => {
    let resolved = false
    const finish = (element: Element | null) => {
      if (resolved) {
        return
      }
      resolved = true
      observer.disconnect()
      clearTimeout(timer)
      resolve(element)
    }

    const observer = new MutationObserver(() => {
      const candidate = findBestGeminiEditor()
      if (candidate) {
        finish(candidate)
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    })

    const timer = setTimeout(() => {
      finish(null)
    }, timeout)
  })
}

const waitForCondition = async (
  condition: () => boolean,
  timeout: number
): Promise<boolean> => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (condition()) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return condition()
}

const countAttachmentChips = (editor: HTMLElement) =>
  (editor.closest("fieldset") ?? document).querySelectorAll(
    ATTACHMENT_CHIP_SELECTOR
  ).length

const attachGeminiImages = async (
  editor: HTMLElement,
  images: ImagePayload[]
): Promise<boolean> => {
  const baseline = countAttachmentChips(editor)
  if (await attachImagesToEditor(editor, images)) {
    return true
  }

  if (!document.querySelector(UPLOAD_CONSENT_DIALOG_SELECTOR)) {
    return false
  }

  const answered = await waitForCondition(
    () => !document.querySelector(UPLOAD_CONSENT_DIALOG_SELECTOR),
    UPLOAD_CONSENT_TIMEOUT_MS
  )
  if (!answered) {
    return false
  }

  return waitForCondition(
    () => countAttachmentChips(editor) > baseline,
    ATTACHMENT_CHIP_TIMEOUT_MS
  )
}

const isClickable = (button: HTMLElement) =>
  !(button instanceof HTMLButtonElement && button.disabled) &&
  button.getAttribute("aria-disabled") !== "true"

const findGeminiSendButton = (): HTMLElement | null => {
  for (const selector of SEND_BUTTON_SELECTORS) {
    try {
      const candidate = document.querySelector(selector)
      if (candidate instanceof HTMLElement && isClickable(candidate)) {
        return candidate
      }
    } catch {
      // Ignore invalid selector in older engines
    }
  }

  const icons = Array.from(
    document.querySelectorAll(
      "mat-icon[fonticon='send'], mat-icon[data-mat-icon-name='send']"
    )
  )
  for (const icon of icons) {
    const button = icon.closest("button")
    if (button instanceof HTMLElement && isClickable(button)) {
      return button
    }
  }

  return null
}

const fillGeminiInput = async (
  prompt: string,
  sessionId?: string,
  autoSend = true,
  images?: ImagePayload[]
) => {
  setActiveSession(sessionId)

  const editor = ((await waitForGeminiEditor()) as HTMLElement | null)

  if (!editor) {
    return
  }

  if (images && images.length > 0 && editor instanceof HTMLElement) {
    const attached = await attachGeminiImages(editor, images)
    if (!attached) {
      console.warn(
        `10x Chat: Gemini did not confirm ${images.length} image attachment(s); sending prompt anyway`
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
    await new Promise((resolve) => setTimeout(resolve, INPUT_SETTLE_MS))
    const sendButton = findGeminiSendButton()
    if (sendButton) {
      sendButton.click()
      return
    }

    const container = (editor.closest("form") ?? document) as
      | Document
      | Element
    await clickSendWhenReady(container, editor, SEND_BUTTON_SELECTORS)
  }
}

export default defineContentScript({
  matches: ["https://gemini.google.com/*"],
  runAt: "document_end",
  main() {
    ensureObserver()

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SET_PROMPT" && typeof message.prompt === "string") {
        ensureObserver()
        fillGeminiInput(
          message.prompt,
          message.sessionId,
          message.autoSend !== false,
          message.images
        )
        sendResponse({ success: true })
        return true
      }
      if (
        message?.type === "FILL_GEMINI_PROMPT" &&
        typeof message.prompt === "string"
      ) {
        ensureObserver()
        fillGeminiInput(
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
      const params = new URLSearchParams(window.location.search)
      const query = params.get("q")
      if (query) {
        setTimeout(() => {
          fillGeminiInput(query, undefined, true)
        }, 1000)
      }
    })
  }
})
