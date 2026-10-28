import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

import IndexPopup from "../../src/popup"
import { sendToBackground } from "../../src/lib/messaging"

jest.mock("../../src/lib/messaging", () => ({
  sendToBackground: jest
    .fn()
    .mockResolvedValue({ status: "success", message: "ok" })
}))

jest.mock("../../src/lib/i18n", () => {
  const messages = require("../../public/_locales/en/messages.json") as Record<
    string,
    { message: string }
  >
  const translate = (key: string, subs?: string[]) => {
    let out = messages[key]?.message ?? key
    subs?.forEach((value) => {
      out = out.replace(/\$[A-Z0-9_]+\$/u, value)
    })
    return out
  }
  return {
    i18n: jest.fn((key: string, subs?: string[]) => translate(key, subs)),
    i18nCount: jest.fn((key: string, count: number) =>
      translate(key, [String(count)])
    )
  }
})

Object.defineProperty(window, "close", { value: jest.fn(), writable: true })

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

let fileSeed = 0
/** Distinct bytes per file — attachments are deduped by decoded content. */
const imageFile = (name: string) =>
  new File([Uint8Array.from([137, 80, 78, 71, (fileSeed += 1)])], name, {
    type: "image/png"
  })

const textFile = (name: string) =>
  new File(["hello"], name, { type: "text/plain" })

/** jsdom has no DataTransfer, so build the minimal shape the handlers read. */
const clipboardWith = (files: File[]) => ({
  items: files.map((f) => ({
    kind: "file",
    type: f.type,
    getAsFile: () => f
  })),
  files,
  types: ["Files"],
  getData: () => ""
})

describe("QA: image attachments", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(chrome.storage.sync.get as jest.Mock).mockImplementation(
      (_keys, cb: (v: unknown) => void) => {
        cb({
          enabledServices: {
            chatgpt: true,
            grok: true,
            gemini: true,
            perplexity: true,
            claude: true
          }
        })
        return Promise.resolve()
      }
    )
    ;(chrome.storage.local.get as jest.Mock).mockImplementation(
      (_keys, cb: (v: unknown) => void) => {
        cb({})
        return Promise.resolve()
      }
    )
  })

  const attachedCount = () =>
    document.querySelectorAll<HTMLImageElement>('img[alt$=".png"]').length

  it("paste of an image file produces a preview chip", async () => {
    render(<IndexPopup />)
    const textarea = screen.getByRole("textbox")

    fireEvent.paste(textarea, {
      clipboardData: clipboardWith([imageFile("pasted.png")])
    })

    await waitFor(() => expect(attachedCount()).toBe(1))
    expect(screen.getByAltText("pasted.png")).toBeInTheDocument()
  })

  it("paste of a non-image is ignored and does not block text paste", async () => {
    render(<IndexPopup />)
    const textarea = screen.getByRole("textbox")

    const evt = fireEvent.paste(textarea, {
      clipboardData: clipboardWith([textFile("notes.txt")])
    })

    expect(evt).toBe(true) // not preventDefault()-ed
    await waitFor(() => expect(attachedCount()).toBe(0))
  })

  it("drop of multiple images attaches all of them", async () => {
    const { container } = render(<IndexPopup />)
    const root = container.firstElementChild as HTMLElement

    fireEvent.drop(root, {
      dataTransfer: { files: [imageFile("a.png"), imageFile("b.png")] }
    })

    await waitFor(() => expect(attachedCount()).toBe(2))
  })

  it("drop filters out non-image files", async () => {
    const { container } = render(<IndexPopup />)
    const root = container.firstElementChild as HTMLElement

    fireEvent.drop(root, {
      dataTransfer: { files: [imageFile("ok.png"), textFile("bad.txt")] }
    })

    await waitFor(() => expect(attachedCount()).toBe(1))
  })

  it("removing one chip leaves the others and rewrites the cache", async () => {
    render(<IndexPopup />)
    const textarea = screen.getByRole("textbox")

    fireEvent.paste(textarea, {
      clipboardData: clipboardWith([imageFile("a.png"), imageFile("b.png")])
    })
    await waitFor(() => expect(attachedCount()).toBe(2))

    fireEvent.click(screen.getByTitle("Remove a.png"))

    await waitFor(() => expect(attachedCount()).toBe(1))
    expect(screen.getByAltText("b.png")).toBeInTheDocument()
    const lastSet = (chrome.storage.local.set as jest.Mock).mock.calls.at(-1)
    expect(lastSet?.[0].cachedImages).toHaveLength(1)
  })

  it("one unreadable file does not swallow the images that read fine", async () => {
    const RealFileReader = global.FileReader
    class FlakyFileReader {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      result: string | null = null
      readAsDataURL(file: File) {
        setTimeout(() => {
          if (file.name === "broken.png") {
            this.onerror?.()
          } else {
            this.result = PIXEL
            this.onload?.()
          }
        }, 0)
      }
    }
    // @ts-expect-error minimal test double
    global.FileReader = FlakyFileReader

    try {
      render(<IndexPopup />)
      const textarea = screen.getByRole("textbox")
      fireEvent.paste(textarea, {
        clipboardData: clipboardWith([
          imageFile("broken.png"),
          imageFile("good.png")
        ])
      })

      await waitFor(() => expect(screen.getByAltText("good.png")).toBeVisible(), {
        timeout: 1000
      })
    } finally {
      global.FileReader = RealFileReader
    }
  })

  it("images survive into the launchQueries payload", async () => {
    render(<IndexPopup />)
    const textarea = screen.getByRole("textbox")

    fireEvent.change(textarea, { target: { value: "look at this" } })
    fireEvent.paste(textarea, {
      clipboardData: clipboardWith([imageFile("shot.png")])
    })
    await waitFor(() => expect(attachedCount()).toBe(1))

    fireEvent.click(screen.getByTestId("submit-button"))

    await waitFor(() => expect(sendToBackground).toHaveBeenCalled())
    const payload = (sendToBackground as jest.Mock).mock.calls[0][0]
    expect(payload.name).toBe("launchQueries")
    expect(payload.body.query).toBe("look at this")
    expect(payload.body.images).toHaveLength(1)
    expect(payload.body.images[0]).toMatchObject({
      name: "shot.png",
      type: "image/png"
    })
    expect(payload.body.images[0].dataUrl).toMatch(/^data:image\/png;base64,/)
  })
})

describe("QA: attachImagesToEditor delivery", () => {
  const { attachImagesToEditor } = require("../../src/contents/lib/dom-helpers")

  // jsdom ships no DataTransfer, which silently disables the file-input
  // branch of attachImagesToEditor. Real pages have it, so polyfill enough
  // of it to exercise the branch the browser actually takes.
  const RealDataTransfer = (global as { DataTransfer?: unknown }).DataTransfer
  beforeAll(() => {
    class FakeDataTransfer {
      private readonly stored: File[] = []
      readonly items = {
        add: (file: File) => {
          this.stored.push(file)
        }
      }
      get files(): File[] {
        return this.stored
      }
    }
    ;(global as { DataTransfer?: unknown }).DataTransfer = FakeDataTransfer
  })
  afterAll(() => {
    ;(global as { DataTransfer?: unknown }).DataTransfer = RealDataTransfer
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  /**
   * jsdom makes `input.files` read-only; Chrome has made it settable since 62,
   * which is the whole reason the file-input fallback exists. Mirror Chrome.
   */
  const makeFileInput = (
    accept: string,
    parent: HTMLElement = document.body
  ) => {
    const input = document.createElement("input")
    input.type = "file"
    input.setAttribute("accept", accept)
    let stored: File[] = []
    Object.defineProperty(input, "files", {
      configurable: true,
      get: () => stored,
      set: (v: File[]) => {
        stored = v
      }
    })
    parent.appendChild(input)
    return input
  }

  const SETTLE = 300
  const onePixel = [{ name: "x.png", type: "image/png", dataUrl: PIXEL }]

  /** A composer wrapper, as every real host has — never a bare body child. */
  let composer: HTMLElement
  const makeEditor = () => {
    composer = document.createElement("div")
    composer.className = "composer"
    document.body.appendChild(composer)
    const editor = document.createElement("div")
    editor.setAttribute("contenteditable", "true")
    composer.appendChild(editor)
    return editor
  }

  /** Stand-in for a host that accepts the paste and renders a thumbnail. */
  const acceptPasteWithPreview = (editor: HTMLElement) => {
    editor.addEventListener("paste", (e) => {
      e.preventDefault()
      const thumb = document.createElement("img")
      thumb.src = PIXEL
      editor.parentElement?.appendChild(thumb)
    })
  }

  it("uses exactly one delivery channel when the composer has a file input", async () => {
    const editor = makeEditor()
    const fileInput = makeFileInput("image/*", composer)

    let pastes = 0
    let changes = 0
    editor.addEventListener("paste", () => {
      pastes += 1
    })
    fileInput.addEventListener("change", () => {
      changes += 1
      const thumb = document.createElement("img")
      thumb.src = PIXEL
      composer.appendChild(thumb)
    })

    await attachImagesToEditor(editor, onePixel, SETTLE)

    expect(changes).toBe(1)
    expect(pastes).toBe(0)
    expect(fileInput.files).toHaveLength(1)
  })

  it("falls back to paste when the composer has no file input", async () => {
    const editor = makeEditor()

    const pasted = jest.fn()
    editor.addEventListener("paste", pasted)

    await attachImagesToEditor(editor, onePixel, SETTLE)

    expect(pasted).toHaveBeenCalledTimes(1)
  })

  it("does not fire both channels even when the preview arrives late", async () => {
    const editor = makeEditor()
    const fileInput = makeFileInput("image/*", composer)

    const pasted = jest.fn()
    editor.addEventListener("paste", pasted)
    fileInput.addEventListener("change", () => {
      // Host takes longer than the settle budget to render its thumbnail.
      setTimeout(() => {
        const thumb = document.createElement("img")
        thumb.src = PIXEL
        composer.appendChild(thumb)
      }, SETTLE * 3)
    })

    await attachImagesToEditor(editor, onePixel, SETTLE)

    expect(pasted).not.toHaveBeenCalled()
  })

  it("stops waiting once a collapsed batch preview stops growing", async () => {
    const editor = makeEditor()
    const fileInput = makeFileInput("image/*", composer)
    fileInput.addEventListener("change", () => {
      // Host shows one combined chip for the whole batch.
      const chip = document.createElement("div")
      chip.setAttribute("data-testid", "attachment-chip")
      composer.appendChild(chip)
    })

    const threeImages = [1, 2, 3].map((n) => ({
      name: `img${n}.png`,
      type: "image/png",
      dataUrl: PIXEL
    }))

    const budget = 6000
    const started = Date.now()
    const ok = await attachImagesToEditor(editor, threeImages, budget)
    const elapsed = Date.now() - started

    expect(ok).toBe(true)
    // Must return on the quiet period, not burn the whole settle budget.
    expect(elapsed).toBeLessThan(budget / 2)
  })

  it("does not hijack an image uploader outside the composer", async () => {
    const editor = makeEditor()
    const strayInput = makeFileInput("image/*", document.body)

    const changed = jest.fn()
    strayInput.addEventListener("change", changed)

    await attachImagesToEditor(editor, onePixel, SETTLE)

    expect(changed).not.toHaveBeenCalled()
  })

  it("does not read a pre-existing thumbnail as its own success", async () => {
    const editor = makeEditor()
    for (let i = 0; i < 3; i += 1) {
      const stale = document.createElement("img")
      stale.src = PIXEL
      composer.appendChild(stale)
    }

    const ok = await attachImagesToEditor(editor, onePixel, SETTLE)

    expect(ok).toBe(false)
  })

  it("ignores a thread image that loads mid-poll as evidence", async () => {
    const editor = makeEditor()
    // A remote image lazy-loading during the wait must not count.
    setTimeout(() => {
      const unrelated = document.createElement("img")
      unrelated.src = "https://example.test/avatar.png"
      composer.appendChild(unrelated)
    }, 50)

    const ok = await attachImagesToEditor(editor, onePixel, SETTLE)

    expect(ok).toBe(false)
  })

  it("reports failure when the data URL cannot be decoded", async () => {
    const editor = makeEditor()

    const ok = await attachImagesToEditor(
      editor,
      [
        {
          name: "corrupt.png",
          type: "image/png",
          dataUrl: "data:image/png;base64,"
        }
      ],
      SETTLE
    )

    expect(ok).toBe(false)
  })

  it("reports success once the page shows an attachment preview", async () => {
    const editor = makeEditor()
    editor.addEventListener("paste", (e) => {
      e.preventDefault()
      const thumb = document.createElement("img")
      thumb.src = PIXEL
      editor.parentElement?.appendChild(thumb)
    })

    const ok = await attachImagesToEditor(editor, onePixel, SETTLE)

    expect(ok).toBe(true)
  })

  it("reports failure when no preview ever appears", async () => {
    const editor = makeEditor()

    const ok = await attachImagesToEditor(editor, onePixel, SETTLE)

    expect(ok).toBe(false)
  })
})
