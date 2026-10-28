import { clipDocumentToMarkdown } from "~/lib/page-clipper"

export default defineContentScript({
  matches: ["https://*/*", "http://*/*"],
  runAt: "document_idle",
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.name === "CLIP_PAGE_TO_MARKDOWN") {
        try {
          const result = clipDocumentToMarkdown(document, window.location.href)
          sendResponse({ ok: true, result })
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          sendResponse({ ok: false, error: errorMsg })
        }
        return true
      }
      return false
    })
  }
})
