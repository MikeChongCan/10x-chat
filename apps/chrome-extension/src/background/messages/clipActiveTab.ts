import type { ClippedResult } from "~/lib/page-clipper"

export interface ClipActiveTabResponse {
  ok: boolean
  fileName?: string
  title?: string
  markdown?: string
  error?: string
}

export async function clipActiveTabHandler(): Promise<ClipActiveTabResponse> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (!tab || !tab.id || !tab.url) {
    return { ok: false, error: "No active tab found" }
  }

  // Avoid internal browser pages
  if (
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("about:") ||
    tab.url.startsWith("edge://")
  ) {
    return { ok: false, error: "Cannot clip internal browser pages" }
  }

  let response: { ok: boolean; result?: ClippedResult; error?: string } | undefined

  try {
    response = await chrome.tabs.sendMessage(tab.id, { name: "CLIP_PAGE_TO_MARKDOWN" })
  } catch (_e) {
    // If content script was not already loaded, dynamically inject it
    try {
      if (chrome.scripting) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content-scripts/clipper.js"]
        })
        response = await chrome.tabs.sendMessage(tab.id, { name: "CLIP_PAGE_TO_MARKDOWN" })
      }
    } catch (injectErr: unknown) {
      const msg = injectErr instanceof Error ? injectErr.message : String(injectErr)
      return { ok: false, error: `Failed to inject clipper: ${msg}` }
    }
  }

  if (!response?.ok || !response.result) {
    return { ok: false, error: response?.error || "Failed to extract page content" }
  }

  const { fileName, title, markdown } = response.result
  const dataUri = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`

  if (!chrome.downloads) {
    return { ok: false, error: "Downloads API is not available", fileName, title, markdown }
  }

  try {
    await chrome.downloads.download({
      url: dataUri,
      filename: fileName,
      saveAs: false
    })
  } catch (dlErr: unknown) {
    const errorMsg = dlErr instanceof Error ? dlErr.message : String(dlErr)
    return { ok: false, error: `Download failed: ${errorMsg}`, fileName, title, markdown }
  }

  return {
    ok: true,
    fileName,
    title,
    markdown
  }
}
