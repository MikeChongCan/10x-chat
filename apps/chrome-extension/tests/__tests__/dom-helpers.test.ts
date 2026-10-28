import {
  waitForElement,
  setNativeValue,
  dispatchInputEvents,
  setContentEditableText,
  findSendButton,
  clickSendWhenReady
} from "../../src/contents/lib/dom-helpers"

describe("dom-helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  describe("waitForElement", () => {
    it("immediately returns element if already in DOM", async () => {
      const div = document.createElement("div")
      div.id = "target"
      document.body.appendChild(div)

      const found = await waitForElement("#target", 500)
      expect(found).toBe(div)
    })

    it("detects dynamically inserted element via MutationObserver", async () => {
      const promise = waitForElement("#async-target", 1000)

      setTimeout(() => {
        const div = document.createElement("div")
        div.id = "async-target"
        document.body.appendChild(div)
      }, 50)

      const found = await promise
      expect(found).not.toBeNull()
      expect(found?.id).toBe("async-target")
    })

    it("returns null if element is not found within timeout", async () => {
      const found = await waitForElement("#non-existent", 50)
      expect(found).toBeNull()
    })
  })

  describe("setNativeValue and dispatchInputEvents for textarea", () => {
    it("sets value on HTMLTextAreaElement and dispatches input/change events", () => {
      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      let inputDispatched = false
      let changeDispatched = false
      textarea.addEventListener("input", () => { inputDispatched = true })
      textarea.addEventListener("change", () => { changeDispatched = true })

      setNativeValue(textarea, "Hello World from Test")
      dispatchInputEvents(textarea)

      expect(textarea.value).toBe("Hello World from Test")
      expect(inputDispatched).toBe(true)
      expect(changeDispatched).toBe(true)
    })
  })

  describe("setContentEditableText for rich text editors (ProseMirror / TipTap / Lexical)", () => {
    it("sets textContent and dispatches InputEvent on contenteditable div", () => {
      const editor = document.createElement("div")
      editor.setAttribute("contenteditable", "true")
      document.body.appendChild(editor)

      let inputEventReceived: InputEvent | null = null
      editor.addEventListener("input", (e) => {
        inputEventReceived = e as InputEvent
      })

      setContentEditableText(editor, "Testing Prompt Injection")

      expect(editor.textContent).toBe("Testing Prompt Injection")
      expect(inputEventReceived).not.toBeNull()
    })
  })

  describe("findSendButton and clickSendWhenReady", () => {
    it("finds button by extra selector", () => {
      const container = document.createElement("div")
      const button = document.createElement("button")
      button.setAttribute("data-testid", "send-button")
      container.appendChild(button)
      document.body.appendChild(container)

      const found = findSendButton(container, ["button[data-testid='send-button']"])
      expect(found).toBe(button)
    })

    it("finds button by aria-label containing 'send' or 'submit'", () => {
      const container = document.createElement("div")
      const button = document.createElement("button")
      button.setAttribute("aria-label", "Send prompt to AI")
      container.appendChild(button)
      document.body.appendChild(container)

      const found = findSendButton(container)
      expect(found).toBe(button)
    })

    it("clicks send button when ready", async () => {
      const container = document.createElement("div")
      const button = document.createElement("button")
      button.setAttribute("data-testid", "send-button")
      let clicked = false
      button.addEventListener("click", () => {
        clicked = true
      })
      container.appendChild(button)
      document.body.appendChild(container)

      await clickSendWhenReady(container, button, ["button[data-testid='send-button']"], 500)
      expect(clicked).toBe(true)
    })
  })

  describe("image attachment helpers", () => {
    const testBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

    it("converts dataUrl to File object correctly", () => {
      const { dataUrlToFile } = require("../../src/contents/lib/dom-helpers")
      const file = dataUrlToFile(testBase64, "pixel.png", "image/png")

      expect(file).toBeInstanceOf(File)
      expect(file.name).toBe("pixel.png")
      expect(file.type).toBe("image/png")
      expect(file.size).toBeGreaterThan(0)
    })

    it("returns null instead of an empty File for an undecodable dataUrl", () => {
      const { dataUrlToFile } = require("../../src/contents/lib/dom-helpers")

      expect(dataUrlToFile("data:image/png;base64,", "bad.png")).toBeNull()
      expect(dataUrlToFile("not-a-data-url", "bad.png")).toBeNull()
    })

    it("attaches images by dispatching a paste event on the editor", async () => {
      const { attachImagesToEditor } = require("../../src/contents/lib/dom-helpers")
      const editor = document.createElement("div")
      editor.setAttribute("contenteditable", "true")
      document.body.appendChild(editor)

      let pasteEventReceived = false
      editor.addEventListener("paste", (e) => {
        pasteEventReceived = true
        e.preventDefault()
      })

      await attachImagesToEditor(
        editor,
        [{ name: "test.png", type: "image/png", dataUrl: testBase64 }],
        200
      )

      expect(pasteEventReceived).toBe(true)
    })
  })
})

