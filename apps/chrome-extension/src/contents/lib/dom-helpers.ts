const DEFAULT_WAIT_TIMEOUT_MS = 30_000

/**
 * Wait for a DOM element matching `selector` to appear.
 * Resolves `null` if the element is not found within `timeout` ms.
 */
export const waitForElement = <T extends Element = Element>(
  selector: string,
  timeout = DEFAULT_WAIT_TIMEOUT_MS
): Promise<T | null> => {
  return new Promise((resolve) => {
    const immediate = document.querySelector<T>(selector)
    if (immediate) {
      resolve(immediate)
      return
    }
    const observer = new MutationObserver(() => {
      const element = document.querySelector<T>(selector)
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

/**
 * Wait for any element matching an ordered list of candidate selectors.
 * Selectors are evaluated in priority order on each check / mutation,
 * ensuring high-priority specific selectors win over broad fallbacks,
 * while sharing a single timeout without sequential delays.
 */
export const waitForFirstMatchingElement = <T extends Element = Element>(
  selectors: string[],
  timeout = DEFAULT_WAIT_TIMEOUT_MS
): Promise<T | null> => {
  return new Promise((resolve) => {
    const findMatch = (): T | null => {
      for (const sel of selectors) {
        const found = document.querySelector<T>(sel)
        if (found) return found
      }
      return null
    }

    const immediate = findMatch()
    if (immediate) {
      resolve(immediate)
      return
    }

    const observer = new MutationObserver(() => {
      const match = findMatch()
      if (match) {
        observer.disconnect()
        resolve(match)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

/**
 * Set a textarea's value bypassing React's synthetic event system
 * by calling the native setter directly.
 */
export const setNativeValue = (
  element: HTMLTextAreaElement,
  value: string
) => {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  ) as PropertyDescriptor | undefined
  if (descriptor?.set) {
    descriptor.set.call(element, value)
  } else {
    element.value = value
  }
}

/**
 * Dispatch `input` + `change` events to trigger framework reactivity.
 */
export const dispatchInputEvents = (element: Element) => {
  try {
    element.dispatchEvent(
      new InputEvent("input", { bubbles: true, cancelable: true })
    )
  } catch {
    element.dispatchEvent(new Event("input", { bubbles: true }))
  }
  element.dispatchEvent(new Event("change", { bubbles: true }))
}

/**
 * Set text inside a contenteditable element using execCommand
 * (preserves undo history) with robust fallbacks for background tabs
 * where `execCommand` and `window.getSelection()` are no-ops.
 */
export const setContentEditableText = (
  element: HTMLElement,
  value: string
) => {
  element.focus()

  // Strategy 1: execCommand (works when tab is focused)
  try {
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
      const range = document.createRange()
      range.selectNodeContents(element)
      selection.addRange(range)
    }
    const inserted = document.execCommand("insertText", false, value)
    if (inserted && (element.textContent?.trim().length ?? 0) > 0) {
      dispatchInputEvents(element)
      return
    }
  } catch {
    // execCommand / getSelection can throw on background tabs — fall through
  }

  // Strategy 2: Direct DOM manipulation with synthetic InputEvent.
  // Lexical and ProseMirror listen for InputEvent with `inputType`,
  // so we dispatch a realistic event even when execCommand fails
  // (unfocused / background tabs).
  if (element.classList.contains("ProseMirror")) {
    element.innerHTML = ""
    const p = document.createElement("p")
    p.textContent = value
    element.appendChild(p)
  } else {
    element.textContent = ""
    element.textContent = value
  }

  // Move caret to end
  try {
    const sel = window.getSelection()
    if (sel) {
      const r = document.createRange()
      r.selectNodeContents(element)
      r.collapse(false)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  } catch {
    // getSelection can throw on background tabs — benign
  }

  // Dispatch beforeinput and input events so rich editors detect the change
  try {
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: value
      })
    )
  } catch {
    // beforeinput not supported in some older environments — benign
  }

  try {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: value
      })
    )
  } catch {
    element.dispatchEvent(new Event("input", { bubbles: true }))
  }
  element.dispatchEvent(new Event("change", { bubbles: true }))
}

/** Create a standard Enter keydown event used for form submission. */
export const createEnterKeyEvent = (): KeyboardEvent =>
  new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  })

/**
 * Find the first enabled send/submit button within a container.
 * Returns `null` when no viable button is found.
 */
export const findSendButton = (
  root: Document | Element,
  extraSelectors: string[] = []
): HTMLButtonElement | null => {
  for (const selector of extraSelectors) {
    const match = root.querySelector<HTMLButtonElement>(selector)
    if (match && !match.disabled) {
      return match
    }
  }

  // Try finding button containing send icons (language independent, e.g. Gemini)
  const sendIcon = root.querySelector(
    "mat-icon[fonticon='send'], mat-icon[data-mat-icon-name='send']"
  )
  if (sendIcon) {
    const button = sendIcon.closest("button")
    if (button && !button.disabled) {
      return button
    }
  }

  const submit = root.querySelector<HTMLButtonElement>("button[type='submit']")
  if (submit && !submit.disabled) {
    return submit
  }
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
  return (
    buttons.find((button) => {
      const label = (button.getAttribute("aria-label") || "").toLowerCase()
      const isSearchMatch = label.includes("search") && !label.includes("research")
      return (
        !button.disabled &&
        (label.includes("send") ||
          label.includes("submit") ||
          isSearchMatch ||
          label.includes("ask"))
      )
    }) || null
  )
}

/**
 * Repeatedly poll for a send button, click when ready, fall back to Enter key.
 */
export const clickSendWhenReady = async (
  container: Document | Element,
  fallbackTarget: Element,
  extraButtonSelectors: string[] = [],
  timeout = DEFAULT_WAIT_TIMEOUT_MS
) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const button = findSendButton(container, extraButtonSelectors)
    if (button) {
      const ariaDisabled = (
        button.getAttribute("aria-disabled") || ""
      ).toLowerCase()
      if (ariaDisabled !== "true") {
        button.click()
        return
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  // Fallback: simulate Enter key
  fallbackTarget.dispatchEvent(createEnterKeyEvent())
}

export type ImagePayload = {
  name: string
  type: string
  dataUrl: string
}

/**
 * Decode a data URL into a File. Returns `null` — never a zero-byte File —
 * when the payload cannot be decoded, so callers can report real failure.
 */
export const dataUrlToFile = (
  dataUrl: string,
  fileName: string,
  fallbackMime = "image/png"
): File | null => {
  try {
    const parts = dataUrl.split(",")
    const mime = parts[0]?.match(/:(.*?);/)?.[1] || fallbackMime
    const bstr = atob(parts[1] || "")
    if (bstr.length === 0) {
      return null
    }
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new File([u8arr], fileName, { type: mime })
  } catch {
    return null
  }
}

/**
 * Candidate roots for the composer this editor belongs to, innermost first:
 * the enclosing form, then a few ancestors. Everything the attach path
 * touches is confined to one of these — a file input elsewhere on the page
 * belongs to some other feature, and writing to it uploads the user's
 * images somewhere they never asked for.
 */
/**
 * Containers the supported hosts wrap their composer in. The paperclip button
 * and its hidden file input are siblings of the editor's own subtree on some
 * of them (Gemini's toolbar sits outside `.rich-textarea`), so an ancestor
 * walk alone is not enough to find the input.
 */
const COMPOSER_CONTAINER_SELECTORS = [
  "form",
  "fieldset",
  "[data-composer-body]",
  "[data-composer-surface]",
  "[data-ask-input-container]",
  "[class*='composer' i]",
  "[class*='input-area' i]",
  "[class*='input-container' i]",
  "[class*='rich-textarea' i]",
  "[role='form']"
]

const composerScopes = (editor: HTMLElement): Element[] => {
  // `body`/`html` are never a composer — treating them as one turns the
  // search document-wide and hands the user's images to whatever unrelated
  // uploader the page happens to have.
  const isDocumentRoot = (node: Element) =>
    node === document.body || node === document.documentElement

  const scopes: Element[] = []
  const push = (node: Element | null) => {
    if (node && !isDocumentRoot(node) && !scopes.includes(node)) {
      scopes.push(node)
    }
  }

  for (const selector of COMPOSER_CONTAINER_SELECTORS) {
    try {
      push(editor.closest(selector))
    } catch {
      // Malformed selector support varies across engines — skip it
    }
  }

  let node: HTMLElement | null = editor.parentElement
  for (let depth = 0; depth < 8 && node && !isDocumentRoot(node); depth += 1) {
    push(node)
    node = node.parentElement
  }
  return scopes
}

/**
 * The scope evidence polling watches. Deliberately the innermost container:
 * a wide root would count unrelated thread images that load mid-poll as proof
 * that our own attachment landed.
 */
const composerScope = (editor: HTMLElement): Element => {
  return composerScopes(editor)[0] ?? editor.parentElement ?? document.body
}

/**
 * Pick a file input belonging to this composer that will accept images.
 * Scoped searches run innermost-first, and the search never widens past the
 * composer: returning `null` is correct when the page has no such input.
 */
type FileInputMatch = {
  input: HTMLInputElement
  /** The container holding both the editor and the input. */
  scope: Element
}

const findImageFileInput = (editor: HTMLElement): FileInputMatch | null => {
  const acceptsImages = (input: HTMLInputElement) => {
    const accept = (input.getAttribute("accept") || "").toLowerCase().trim()
    return accept.includes("image") || accept === "*" || accept === "*/*"
  }
  const isNeutral = (input: HTMLInputElement) =>
    (input.getAttribute("accept") || "").trim() === ""

  for (const scope of composerScopes(editor)) {
    const inputs = Array.from(
      scope.querySelectorAll<HTMLInputElement>("input[type='file']")
    )
    const match = inputs.find(acceptsImages) ?? inputs.find(isNeutral)
    if (match) {
      return { input: match, scope }
    }
  }
  return null
}

/**
 * Count things in the composer that look like an attachment preview.
 * Only ever compared against a baseline taken before we touch the page —
 * an absolute count would read pre-existing thumbnails as our own success.
 */
const countAttachmentPreviews = (scope: Element): number => {
  // Only locally-sourced thumbnails count. Any `img[src]` would let a thread
  // image that lazy-loads mid-poll read as our own attachment landing.
  const thumbs = Array.from(scope.querySelectorAll("img[src]")).filter(
    (img) =>
      img instanceof HTMLImageElement &&
      (img.src.startsWith("blob:") || img.src.startsWith("data:"))
  )
  const chips = scope.querySelectorAll(
    "[data-testid*='attachment' i], [aria-label*='attachment' i], [class*='attachment' i], [aria-label*='attached' i], [data-testid*='attached' i]"
  )
  return thumbs.length + chips.length
}

type AttachEvidence = "full" | "partial" | "none"

/** How long previews must stop arriving before a short count is accepted. */
const PARTIAL_QUIET_MS = 1_200

/**
 * Poll for *new* preview nodes appearing in the composer. Resolves as soon as
 * `expected` of them show up; reports `partial` if the page rendered fewer
 * (some hosts collapse a batch into one chip) and `none` on timeout.
 */
const waitForAttachmentEvidence = async (
  scope: Element,
  baseline: number,
  expected: number,
  timeout: number
): Promise<AttachEvidence> => {
  const deadline = Date.now() + timeout
  let best = 0
  let lastGrowth = Date.now()

  while (Date.now() < deadline) {
    const delta = countAttachmentPreviews(scope) - baseline
    if (delta > best) {
      best = delta
      lastGrowth = Date.now()
    }
    if (best >= expected) {
      return "full"
    }
    // Some hosts collapse a whole batch into a single chip, so once previews
    // have appeared and then stopped arriving, stop burning the rest of the
    // budget — the caller is blocked on this before it can hit send.
    if (best > 0 && Date.now() - lastGrowth >= PARTIAL_QUIET_MS) {
      return "partial"
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return best > 0 ? "partial" : "none"
}

/** Total budget for the host page to accept and render the attachments. */
const ATTACHMENT_SETTLE_TIMEOUT_MS = 8_000

/**
 * Attach images to a chat composer.
 *
 * Writes the files onto the composer's own file input when it has one, and
 * otherwise dispatches a synthetic paste — one channel, never both. Then
 * waits for the host to render previews so the caller does not hit send
 * while the upload is still in flight.
 *
 * Resolves `true` only when the page actually rendered something new.
 */
export const attachImagesToEditor = async (
  editor: HTMLElement,
  images?: ImagePayload[],
  settleTimeout = ATTACHMENT_SETTLE_TIMEOUT_MS
): Promise<boolean> => {
  if (!images || images.length === 0) {
    return true
  }

  const files = images
    .map((img, i) =>
      dataUrlToFile(img.dataUrl, img.name || `image_${i + 1}.png`, img.type)
    )
    .filter((file): file is File => file !== null)

  if (files.length === 0) {
    console.warn("10x Chat: no attachable images — every data URL failed to decode")
    return false
  }

  let dt: DataTransfer | null = null
  if (typeof DataTransfer !== "undefined") {
    try {
      dt = new DataTransfer()
      for (const file of files) {
        dt.items.add(file)
      }
    } catch {
      dt = null
    }
  }

  editor.focus()

  // Exactly one delivery channel runs. Deciding between them by watching the
  // DOM was the source of both failure modes this replaced: a preview that
  // arrives late makes us fire the second channel too and upload everything
  // twice, while an unrelated image loading mid-poll makes us skip the
  // channel that would have worked. The composer's own file input is the
  // same path its paperclip button uses, so prefer it whenever it exists and
  // fall back to paste only when the page has no such input.
  const match = dt ? findImageFileInput(editor) : null

  // Watch wherever the chosen channel lives: a host that renders its chips
  // next to the paperclip rather than inside the editor would otherwise never
  // show evidence, and the caller would stall for the whole settle budget.
  const scope = match?.scope ?? composerScope(editor)
  const baseline = countAttachmentPreviews(scope)

  let delivered = false
  if (match && dt) {
    try {
      match.input.files = dt.files
      match.input.dispatchEvent(new Event("change", { bubbles: true }))
      delivered = true
    } catch {
      // `files` is read-only in some engines — fall through to paste
    }
  }

  if (!delivered) {
    try {
      let pasteEvent: Event
      try {
        pasteEvent = new ClipboardEvent("paste", {
          clipboardData: dt as DataTransfer,
          bubbles: true,
          cancelable: true
        })
      } catch {
        pasteEvent = new Event("paste", { bubbles: true, cancelable: true })
        if (dt) {
          Object.defineProperty(pasteEvent, "clipboardData", {
            value: dt,
            enumerable: true
          })
        }
      }
      editor.dispatchEvent(pasteEvent)
    } catch {
      // ClipboardEvent might fail in older contexts
    }
  }

  // Evidence polling is only a report — it decides nothing — so a wrong read
  // costs a warning or an early return, never a duplicate or a dropped image.
  // Waiting here also keeps the caller from hitting send mid-upload.
  const evidence = await waitForAttachmentEvidence(
    scope,
    baseline,
    files.length,
    settleTimeout
  )

  if (evidence === "none") {
    console.warn(
      `10x Chat: no attachment preview appeared for ${files.length} image(s) within ${settleTimeout}ms`
    )
    return false
  }
  if (evidence === "partial") {
    console.warn(
      `10x Chat: fewer previews than the ${files.length} image(s) sent — the page may have collapsed or rejected some`
    )
  }
  return true
}

