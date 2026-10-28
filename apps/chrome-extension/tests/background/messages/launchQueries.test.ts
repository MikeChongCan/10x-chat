import type { MessagePayload, MessageResponse } from "../../../src/lib/messaging"

import handler from "../../../src/background/messages/launchQueries"

describe("launchQueries handler", () => {
  let mockReq: MessagePayload<any>
  let mockRes: MessageResponse<any>
  let mockTabId: number

  beforeEach(() => {
    mockTabId = 1
    mockReq = {
      body: { query: "test query" },
      name: "launchQueries",
      sender: {} as any
    }
    mockRes = {
      send: jest.fn()
    }

    // Setup default chrome API mocks
    ;(chrome.storage.sync.get as jest.Mock).mockResolvedValue({
      enabledServices: {
        chatgpt: true,
        grok: true,
        gemini: true,
        perplexity: true,
        claude: true
      },
      launchMode: "tabGroup"
    })
    ;(chrome.tabs.create as jest.Mock).mockResolvedValue({
      id: mockTabId++,
      url: ""
    })
    ;(chrome.tabs.group as jest.Mock).mockResolvedValue(1)
    ;(chrome.tabGroups.update as jest.Mock).mockResolvedValue({})
    ;(chrome.system.display.getInfo as jest.Mock).mockResolvedValue([
      {
        isPrimary: true,
        workArea: {
          left: 0,
          top: 0,
          width: 1920,
          height: 1080
        }
      }
    ])
    ;(chrome.windows.create as jest.Mock).mockResolvedValue({
      id: 1,
      tabs: [{ id: mockTabId++ }]
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe("input validation", () => {
    it("should handle missing query", async () => {
      mockReq.body = {}
      await handler(mockReq, mockRes)

      expect(mockRes.send).toHaveBeenCalledWith({
        status: "error",
        message: "Invalid query"
      })
      expect(chrome.tabs.create).not.toHaveBeenCalled()
    })

    it("should handle non-string query", async () => {
      mockReq.body = { query: 123 }
      await handler(mockReq, mockRes)

      expect(mockRes.send).toHaveBeenCalledWith({
        status: "error",
        message: "Invalid query"
      })
      expect(chrome.tabs.create).not.toHaveBeenCalled()
    })

    it("should handle no enabled services", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        enabledServices: {
          chatgpt: false,
          grok: false,
          gemini: false,
          perplexity: false,
          claude: false
        }
      })

      await handler(mockReq, mockRes)

      expect(mockRes.send).toHaveBeenCalledWith({
        status: "error",
        message: "No services enabled"
      })
      expect(chrome.tabs.create).not.toHaveBeenCalled()
    })
  })

  describe("tab group mode", () => {
    beforeEach(() => {
      ;(chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        enabledServices: {
          chatgpt: true,
          grok: true,
          gemini: false,
          perplexity: false,
          claude: true
        },
        launchMode: "tabGroup"
      })
    })

    it("should ask only the requested services", async () => {
      mockReq.body = { query: "test query", services: ["grok", "gemini"] }

      await handler(mockReq, mockRes)

      expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: "https://grok.com/"
      })
    })

    it("should create tabs for enabled services only", async () => {
      await handler(mockReq, mockRes)

      expect(chrome.tabs.create).toHaveBeenCalledTimes(3)
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: "https://chatgpt.com/"
      })
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: "https://grok.com/"
      })
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: "https://claude.ai/new"
      })
    })

    it("should group created tabs", async () => {
      const mockTabIds = [10, 11, 12]
      let tabIndex = 0
      ;(chrome.tabs.create as jest.Mock).mockImplementation(() =>
        Promise.resolve({ id: mockTabIds[tabIndex++] })
      )

      await handler(mockReq, mockRes)

      expect(chrome.tabs.group).toHaveBeenCalledWith({
        tabIds: mockTabIds
      })
      expect(chrome.tabGroups.update).toHaveBeenCalledWith(1, {
        collapsed: false,
        title: "AI Query: test query",
        color: "purple"
      })
    })

    it("should truncate long queries in group title", async () => {
      mockReq.body.query = "This is a very long query that should be truncated"
      await handler(mockReq, mockRes)

      expect(chrome.tabGroups.update).toHaveBeenCalledWith(1, {
        collapsed: false,
        title: "AI Query: This is a very long ...",
        color: "purple"
      })
    })

    it("should handle Gemini auto-fill", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        enabledServices: {
          chatgpt: false,
          grok: false,
          gemini: true,
          perplexity: false,
          claude: false
        },
        launchMode: "tabGroup"
      })

      const mockListener = jest.fn()
      ;(chrome.tabs.onUpdated.addListener as jest.Mock).mockImplementation(
        (listener) => {
          mockListener.mockImplementation(listener)
        }
      )

      await handler(mockReq, mockRes)

      // Simulate tab update
      await mockListener(
        1,
        { status: "complete" },
        { url: "https://gemini.google.com/app" }
      )

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100))

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
        type: "FILL_GEMINI_PROMPT",
        prompt: "test query",
        autoSend: true
      })
    })
  })

  describe("windows mode", () => {
    beforeEach(() => {
      ;(chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        enabledServices: {
          chatgpt: true,
          grok: true,
          gemini: true,
          perplexity: true,
          claude: true
        },
        launchMode: "windows"
      })
    })

    it("should create tiled windows", async () => {
      await handler(mockReq, mockRes)

      expect(chrome.windows.create).toHaveBeenCalledTimes(5)

      // Check first window position
      expect(chrome.windows.create).toHaveBeenNthCalledWith(1, {
        url: "https://chatgpt.com/",
        left: 0,
        top: 0,
        width: 640,
        height: 540,
        type: "normal"
      })

      // Check second window position
      expect(chrome.windows.create).toHaveBeenNthCalledWith(2, {
        url: "https://grok.com/",
        left: 640,
        top: 0,
        width: 640,
        height: 540,
        type: "normal"
      })
    })

    it("should handle different numbers of services", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        enabledServices: {
          chatgpt: true,
          grok: true,
          gemini: false,
          perplexity: false,
          claude: false
        },
        launchMode: "windows"
      })

      await handler(mockReq, mockRes)

      expect(chrome.windows.create).toHaveBeenCalledTimes(2)

      // With 2 services, should create 2 columns
      expect(chrome.windows.create).toHaveBeenNthCalledWith(1, {
        url: "https://chatgpt.com/",
        left: 0,
        top: 0,
        width: 960,
        height: 1080,
        type: "normal"
      })
    })

    it("should handle multiple displays", async () => {
      ;(chrome.system.display.getInfo as jest.Mock).mockResolvedValue([
        {
          isPrimary: false,
          workArea: { left: -1920, top: 0, width: 1920, height: 1080 }
        },
        {
          isPrimary: true,
          workArea: { left: 0, top: 0, width: 2560, height: 1440 }
        }
      ])

      await handler(mockReq, mockRes)

      // Should use primary display
      expect(chrome.windows.create).toHaveBeenNthCalledWith(1, {
        url: "https://chatgpt.com/",
        left: 0,
        top: 0,
        width: 853,
        height: 720,
        type: "normal"
      })
    })
  })

  describe("legacy tabs mode", () => {
    beforeEach(() => {
      ;(chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        enabledServices: {
          chatgpt: true,
          grok: false,
          gemini: false,
          perplexity: false,
          claude: true
        },
        launchMode: "tabs"
      })
    })

    it("should create tabs without grouping", async () => {
      await handler(mockReq, mockRes)

      expect(chrome.tabs.create).toHaveBeenCalledTimes(2)
      expect(chrome.tabs.group).not.toHaveBeenCalled()
      expect(chrome.windows.create).not.toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    it("should handle tab creation errors", async () => {
      ;(chrome.tabs.create as jest.Mock).mockRejectedValueOnce(
        new Error("Tab creation failed")
      )

      await handler(mockReq, mockRes)

      expect(mockRes.send).toHaveBeenCalledWith({
        status: "success",
        message: "Tabs launch initiated"
      })
    })

    it("should handle tab grouping errors", async () => {
      ;(chrome.tabs.group as jest.Mock).mockRejectedValueOnce(
        new Error("Grouping failed")
      )

      await handler(mockReq, mockRes)

      expect(mockRes.send).toHaveBeenCalledWith({
        status: "success",
        message: "Tabs launch initiated"
      })
    })

    it("should handle missing response object", async () => {
      await handler(mockReq, null as any)

      // Should not throw
      expect(chrome.tabs.create).toHaveBeenCalled()
    })
  })

  describe("default values", () => {
    it("should use default services when not in storage", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockResolvedValue({})

      await handler(mockReq, mockRes)

      // Should create tabs for all 5 default services
      expect(chrome.tabs.create).toHaveBeenCalledTimes(5)
    })

    it("should use tabGroup as default launch mode", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        enabledServices: {
          chatgpt: true,
          grok: false,
          gemini: false,
          perplexity: false,
          claude: false
        }
      })

      await handler(mockReq, mockRes)

      expect(chrome.tabs.group).toHaveBeenCalled()
      expect(chrome.windows.create).not.toHaveBeenCalled()
    })
  })
})
