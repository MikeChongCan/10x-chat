import { clipActiveTabHandler } from "../../../src/background/messages/clipActiveTab"

describe("clipActiveTabHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns error if no active tab found", async () => {
    ;(chrome.tabs.query as jest.Mock).mockResolvedValue([])
    const res = await clipActiveTabHandler()
    expect(res.ok).toBe(false)
    expect(res.error).toBe("No active tab found")
  })

  it("refuses to clip internal browser pages", async () => {
    ;(chrome.tabs.query as jest.Mock).mockResolvedValue([
      { id: 101, url: "chrome://settings" }
    ])
    const res = await clipActiveTabHandler()
    expect(res.ok).toBe(false)
    expect(res.error).toContain("Cannot clip internal browser pages")
  })

  it("clips active tab and triggers download when content script responds", async () => {
    ;(chrome.tabs.query as jest.Mock).mockResolvedValue([
      { id: 102, url: "https://chatgpt.com/c/123" }
    ])
    ;(chrome.tabs.sendMessage as jest.Mock).mockResolvedValue({
      ok: true,
      result: {
        title: "Test Chat",
        fileName: "ChatGPT - Test Chat.md",
        platform: "ChatGPT",
        url: "https://chatgpt.com/c/123",
        markdown: "# Test Chat\n\n### 🧑 You\nHello\n"
      }
    })

    const res = await clipActiveTabHandler()
    expect(res.ok).toBe(true)
    expect(res.fileName).toBe("ChatGPT - Test Chat.md")
    expect(res.markdown).toContain("# Test Chat")
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "ChatGPT - Test Chat.md",
        saveAs: false
      })
    )
  })

  it("injects content script if tab was not initially listening", async () => {
    ;(chrome.tabs.query as jest.Mock).mockResolvedValue([
      { id: 103, url: "https://news.ycombinator.com" }
    ])
    ;(chrome.tabs.sendMessage as jest.Mock)
      .mockRejectedValueOnce(new Error("Could not establish connection"))
      .mockResolvedValueOnce({
        ok: true,
        result: {
          title: "Hacker News",
          fileName: "Hacker News.md",
          platform: "Web",
          url: "https://news.ycombinator.com",
          markdown: "# Hacker News\n"
        }
      })

    const res = await clipActiveTabHandler()
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 103 },
      files: ["content-scripts/clipper.js"]
    })
    expect(res.ok).toBe(true)
    expect(res.title).toBe("Hacker News")
  })

  it("reports failure when chrome.downloads.download throws", async () => {
    ;(chrome.tabs.query as jest.Mock).mockResolvedValue([
      { id: 104, url: "https://chatgpt.com/c/456" }
    ])
    ;(chrome.tabs.sendMessage as jest.Mock).mockResolvedValue({
      ok: true,
      result: {
        title: "Test Chat",
        fileName: "ChatGPT - Test Chat.md",
        platform: "ChatGPT",
        url: "https://chatgpt.com/c/456",
        markdown: "# Test Chat\n"
      }
    })
    ;(chrome.downloads.download as jest.Mock).mockRejectedValueOnce(
      new Error("User cancelled download")
    )

    const res = await clipActiveTabHandler()
    expect(res.ok).toBe(false)
    expect(res.error).toContain("Download failed: User cancelled download")
  })
})
