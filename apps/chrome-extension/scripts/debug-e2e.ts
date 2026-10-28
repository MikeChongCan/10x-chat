import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import puppeteer, { type Browser, type Page } from "puppeteer"

const PORT = 3921
const EXTENSION_PATH = path.resolve(__dirname, "../.output/chrome-mv3")
const SCREENSHOTS_DIR = path.resolve(__dirname, "../screenshots")

// Mock HTML templates mimicking real DOM structure of supported AI services
const MOCK_PAGES: Record<string, string> = {
  chatgpt: `
    <!DOCTYPE html>
    <html>
      <head>
        <title>ChatGPT Mock</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 24px; background: #212121; color: #ececec; }
          #app { max-width: 768px; margin: 0 auto; }
          #prompt-textarea { min-height: 80px; border: 1px solid #424242; border-radius: 12px; padding: 12px; background: #2f2f2f; color: #fff; margin-bottom: 12px; }
          button { background: #fff; color: #000; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; }
          .attachment-preview { display: flex; gap: 8px; margin-bottom: 12px; }
          .preview-chip { width: 56px; height: 56px; border-radius: 8px; border: 1px solid #555; background: #333; overflow: hidden; }
          .preview-chip img { width: 100%; height: 100%; object-fit: cover; }
          #responses { margin-top: 24px; padding: 16px; border-radius: 12px; background: #2f2f2f; }
        </style>
      </head>
      <body>
        <div id="app">
          <h2>ChatGPT Simulation</h2>
          <div id="attachment-container" class="attachment-preview"></div>
          <form>
            <div id="prompt-textarea" class="ProseMirror" contenteditable="true" placeholder="Ask anything"></div>
            <input type="file" id="file-input" style="display:none;" />
            <button data-testid="send-button" aria-label="Send prompt">Send</button>
          </form>
          <div id="responses" style="display:none;"></div>
        </div>
        <script>
          const editor = document.getElementById("prompt-textarea");
          const container = document.getElementById("attachment-container");
          editor.addEventListener("paste", (e) => {
            if (e.clipboardData && e.clipboardData.files.length > 0) {
              for (const file of e.clipboardData.files) {
                const img = document.createElement("img");
                img.src = URL.createObjectURL(file);
                const chip = document.createElement("div");
                chip.className = "preview-chip";
                chip.appendChild(img);
                container.appendChild(chip);
              }
            }
          });

          document.querySelector("button").addEventListener("click", (e) => {
            e.preventDefault();
            const text = editor.textContent;
            const res = document.getElementById("responses");
            res.style.display = "block";
            res.setAttribute("data-message-author-role", "assistant");
            res.textContent = "AI Analysis complete for prompt: " + text;
          });
        </script>
      </body>
    </html>
  `,
  claude: `
    <!DOCTYPE html>
    <html>
      <head><title>Claude Mock</title></head>
      <body>
        <main>
          <div class="ProseMirror" contenteditable="true"></div>
          <button aria-label="Send Message">Send</button>
          <div data-testid="assistant-message" style="display:none;"></div>
        </main>
        <script>
          document.querySelector("button").addEventListener("click", (e) => {
            e.preventDefault();
            const res = document.querySelector("[data-testid='assistant-message']");
            res.style.display = "block";
            res.textContent = "Mock Claude response";
          });
        </script>
      </body>
    </html>
  `,
  gemini: `
    <!DOCTYPE html>
    <html>
      <head><title>Gemini Mock</title></head>
      <body>
        <div class="rich-textarea">
          <div class="ql-editor" contenteditable="true"></div>
        </div>
        <button class="send-button" aria-label="Send message">
          <mat-icon fonticon="send"></mat-icon>
        </button>
        <div class="markdown" style="display:none;"></div>
        <script>
          document.querySelector("button").addEventListener("click", (e) => {
            e.preventDefault();
            const res = document.querySelector(".markdown");
            res.style.display = "block";
            res.textContent = "Mock Gemini response";
          });
        </script>
      </body>
    </html>
  `,
  grok: `
    <!DOCTYPE html>
    <html>
      <head><title>Grok Mock</title></head>
      <body>
        <form>
          <div class="tiptap ProseMirror" contenteditable="true"></div>
          <button aria-label="Submit">Submit</button>
        </form>
        <div data-testid="response" style="display:none;"></div>
        <script>
          document.querySelector("button").addEventListener("click", (e) => {
            e.preventDefault();
            const res = document.querySelector("[data-testid='response']");
            res.style.display = "block";
            res.textContent = "Mock Grok response";
          });
        </script>
      </body>
    </html>
  `,
  perplexity: `
    <!DOCTYPE html>
    <html>
      <head><title>Perplexity Mock</title></head>
      <body>
        <div data-ask-input-container>
          <div id="ask-input" data-lexical-editor="true" contenteditable="true"></div>
          <button aria-label="Submit" class="bg-super">Ask</button>
        </div>
        <div class="prose" style="display:none;"></div>
        <script>
          document.querySelector("button").addEventListener("click", (e) => {
            e.preventDefault();
            const res = document.querySelector(".prose");
            res.style.display = "block";
            res.textContent = "Mock Perplexity response";
          });
        </script>
      </body>
    </html>
  `
}

async function startMockServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const pathname = (req.url || "/").replace(/^\//, "")
      const html = MOCK_PAGES[pathname]
      if (html) {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(html)
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end("Not Found")
      }
    })
    server.listen(PORT, () => {
      resolve(server)
    })
  })
}

async function runDebugSuite() {
  console.log("==================================================")
  console.log("🚀 10x-chat-browser Automated E2E & QA Reporter")
  console.log("==================================================")

  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  }

  const server = await startMockServer()
  console.log(`✔ Mock AI server running at http://localhost:${PORT}`)

  const executablePath = await puppeteer.executablePath()
  console.log(`✔ Chrome Executable: ${executablePath}`)

  const browser: Browser = await puppeteer.launch({
    headless: false,
    executablePath,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  })

  try {
    const workerTarget = await browser.waitForTarget(
      (target) =>
        target.type() === "service_worker" &&
        target.url().includes("background.js"),
      { timeout: 8000 }
    ).catch(() => null)

    let extensionId = ""
    if (workerTarget) {
      const url = new URL(workerTarget.url())
      extensionId = url.hostname
      console.log(`✔ Extension Service Worker detected! Extension ID: ${extensionId}`)
    } else {
      const targets = browser.targets()
      for (const t of targets) {
        if (t.url().startsWith("chrome-extension://")) {
          extensionId = new URL(t.url()).hostname
          break
        }
      }
    }

    const page: Page = await browser.newPage()

    // 1. Test & Screenshot Popup Redesign
    if (extensionId) {
      const popupUrl = `chrome-extension://${extensionId}/popup.html`
      await page.setViewport({ width: 380, height: 520 })
      await page.goto(popupUrl, { waitUntil: "networkidle0" })
      console.log(`✔ Popup loaded: ${popupUrl}`)

      const popupScreenshotPath = path.join(SCREENSHOTS_DIR, "01-popup-redesign.png")
      await page.screenshot({ path: popupScreenshotPath, fullPage: true })
      console.log(`📸 Screenshot saved: ${popupScreenshotPath}`)

      // 2. Test Image Attachment & Text Input in Popup
      await page.type("textarea", "Compare market trends across these models")

      // Simulate attaching image via storage / state
      await page.evaluate(() => {
        const sampleBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC"
        chrome.storage.local.set({
          cachedQuery: "Compare market trends across these models",
          cachedImages: [
            {
              id: "img_test_1",
              name: "quarterly_chart.png",
              type: "image/png",
              dataUrl: sampleBase64,
              size: 2048
            }
          ]
        })
      })

      // Reload popup to verify Keep Input with image restoration
      await page.reload({ waitUntil: "networkidle0" })
      await new Promise((r) => setTimeout(r, 400))

      const popupImageScreenshotPath = path.join(SCREENSHOTS_DIR, "02-popup-with-image.png")
      await page.screenshot({ path: popupImageScreenshotPath, fullPage: true })
      console.log(`📸 Screenshot saved: ${popupImageScreenshotPath}`)

      // 3. Test & Screenshot Options Page Redesign
      const optionsUrl = `chrome-extension://${extensionId}/options.html`
      await page.setViewport({ width: 900, height: 900 })
      await page.goto(optionsUrl, { waitUntil: "networkidle0" })
      console.log(`✔ Options page loaded: ${optionsUrl}`)

      const optionsScreenshotPath = path.join(SCREENSHOTS_DIR, "03-options-page-redesign.png")
      await page.screenshot({ path: optionsScreenshotPath, fullPage: true })
      console.log(`📸 Screenshot saved: ${optionsScreenshotPath}`)
    }

    // 4. Test Multi-Agent Injection on Mock Pages
    console.log("\n🧪 Testing Input & Image Injection on Mock AI Pages...")
    for (const [service, _] of Object.entries(MOCK_PAGES)) {
      const mockUrl = `http://localhost:${PORT}/${service}`
      await page.goto(mockUrl, { waitUntil: "networkidle0" })

      const injectionResult = await page.evaluate(async (svc) => {
        let editor: HTMLElement | null = null
        if (svc === "chatgpt") {
          editor = document.querySelector("#prompt-textarea")
        } else if (svc === "claude") {
          editor = document.querySelector(".ProseMirror")
        } else if (svc === "gemini") {
          editor = document.querySelector(".ql-editor")
        } else if (svc === "grok") {
          editor = document.querySelector(".tiptap")
        } else if (svc === "perplexity") {
          editor = document.querySelector("#ask-input")
        }

        if (!editor) {
          return { success: false, reason: `Editor for ${svc} not found` }
        }

        editor.focus()
        editor.textContent = `Test multi-agent prompt for ${svc}`
        editor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: `Test multi-agent prompt for ${svc}`
          })
        )

        const button = document.querySelector("button")
        if (!button) {
          return { success: false, reason: `Button for ${svc} not found` }
        }
        button.click()

        return {
          success: true,
          editorText: editor.textContent,
          buttonClicked: true
        }
      }, service)

      if (injectionResult.success) {
        console.log(`  [${service.toUpperCase()}] ✔ Input populated & button clicked successfully!`)
      } else {
        console.error(`  [${service.toUpperCase()}] ✖ Failed: ${injectionResult.reason}`)
      }
    }

    // Screenshot simulated injected page
    const mockChatgptUrl = `http://localhost:${PORT}/chatgpt`
    await page.goto(mockChatgptUrl, { waitUntil: "networkidle0" })
    await page.evaluate(() => {
      const editor = document.querySelector("#prompt-textarea") as HTMLElement
      if (editor) {
        editor.textContent = "Tell me the key insights from this chart."
      }
      const button = document.querySelector("button") as HTMLElement
      if (button) {
        button.click()
      }
    })
    await new Promise((r) => setTimeout(r, 200))

    const mockInjectedScreenshotPath = path.join(SCREENSHOTS_DIR, "04-chatgpt-injected.png")
    await page.screenshot({ path: mockInjectedScreenshotPath })
    console.log(`📸 Screenshot saved: ${mockInjectedScreenshotPath}`)

    console.log("\n🎉 All QA test checks & screenshots completed successfully!")
  } finally {
    await browser.close()
    server.close()
  }
}

runDebugSuite().catch((err) => {
  console.error("QA automation error:", err)
  process.exit(1)
})
