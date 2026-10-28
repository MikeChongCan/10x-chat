import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import IndexPopup from "../../src/popup"
import { sendToBackground } from "../../src/lib/messaging"

jest.mock("../../src/lib/messaging", () => ({
  sendToBackground: jest.fn().mockResolvedValue({ status: "success", message: "ok" })
}))

jest.mock("../../src/lib/i18n", () => {
  const enMessages = require("../../public/_locales/en/messages.json") as Record<
    string,
    { message: string }
  >

  const dictionary = Object.fromEntries(
    Object.entries(enMessages).map(([key, value]) => [key, value.message])
  ) as Record<string, string>

  const translate = (key: string, substitutions?: string[]) => {
    const template = dictionary[key]
    if (!template) {
      return key
    }
    if (!substitutions || substitutions.length === 0) {
      return template
    }
    let result = template
    substitutions.forEach((value) => {
      result = result.replace(/\$[A-Z0-9_]+\$/u, value)
    })
    return result
  }

  return {
    i18n: jest.fn((key: string, substitutions?: string[]) =>
      translate(key, substitutions)
    ),
    i18nCount: jest.fn((key: string, count: number) =>
      translate(key, [count.toString()])
    )
  }
})

const mockWindowClose = jest.fn()
Object.defineProperty(window, "close", {
  value: mockWindowClose,
  writable: true
})

describe("IndexPopup", () => {
  const user = userEvent.setup()
  const sendMock = sendToBackground as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      writable: true,
      configurable: true
    })

    ;(chrome.storage.sync.get as jest.Mock).mockImplementation(
      (_keys, callback: (value: unknown) => void) => {
        callback({
          enabledServices: {
            chatgpt: true,
            grok: true,
            gemini: true,
            perplexity: true,
            claude: true
          },
          continuousMode: false,
          integrationMode: false
        })
        return Promise.resolve()
      }
    )
    ;(chrome.storage.local.get as jest.Mock).mockImplementation(
      (_keys, callback: (value: unknown) => void) => {
        callback({})
        return Promise.resolve()
      }
    )
    ;(chrome.runtime.openOptionsPage as jest.Mock).mockResolvedValue(undefined)
  })

  describe("rendering", () => {
    it("should render the main interface", async () => {
      render(<IndexPopup />)

      expect(screen.getByText("10x Chat")).toBeInTheDocument()
      expect(screen.getByText("Ask several AI assistants at once")).toBeInTheDocument()
      expect(screen.getByText("Your Questions")).toBeInTheDocument()
      expect(screen.getByText("Submit")).toBeInTheDocument()
    })

    it("should show enabled services count", async () => {
      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText("5 services active")).toBeInTheDocument()
      })
    })

    it("should show enabled service badges", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockImplementationOnce(
        (_keys, callback: (value: unknown) => void) => {
          callback({
            enabledServices: {
              chatgpt: true,
              grok: false,
              gemini: true,
              perplexity: false,
              claude: true
            },
            continuousMode: false,
            integrationMode: false
          })
          return Promise.resolve()
        }
      )

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText("3 services active")).toBeInTheDocument()
        expect(screen.getByText("ChatGPT")).toBeInTheDocument()
        expect(screen.getByText("Gemini")).toBeInTheDocument()
        expect(screen.getByText("Claude")).toBeInTheDocument()
        expect(screen.queryByText("Grok")).not.toBeInTheDocument()
        expect(screen.queryByText("Perplexity")).not.toBeInTheDocument()
      })
    })

    it("should show platform-specific keyboard shortcut", async () => {
      const view = render(<IndexPopup />)

      expect(
        screen.getByPlaceholderText(/Ask anything.*⌘↵.*submit/)
      ).toBeInTheDocument()

      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        writable: true,
        configurable: true
      })

      view.rerender(<IndexPopup />)
      expect(
        screen.getByPlaceholderText(/Ask anything.*Ctrl\+↵.*submit/)
      ).toBeInTheDocument()
    })
  })

  describe("query submission", () => {
    it("should submit query on button click", async () => {
      render(<IndexPopup />)

      const textarea = screen.getByPlaceholderText(/Ask anything/)
      const submitButton = screen.getByText("Submit")

      await user.type(textarea, "What is the meaning of life?")
      await user.click(submitButton)

      expect(sendMock).toHaveBeenCalledWith({
        name: "launchQueries",
        body: { query: "What is the meaning of life?", closePreviousTabs: false }
      })

      await waitFor(() => {
        expect(mockWindowClose).toHaveBeenCalled()
      })
    })

    it("should ask only the clicked services", async () => {
      render(<IndexPopup />)

      const textarea = screen.getByPlaceholderText(/Ask anything/)
      await user.click(screen.getByTestId("service-chip-gemini"))
      await user.click(screen.getByTestId("service-chip-claude"))
      expect(screen.getByTestId("service-chip-gemini")).toHaveAttribute("aria-pressed", "true")
      expect(screen.getByText("Asking only 2")).toBeInTheDocument()

      await user.click(screen.getByTestId("service-chip-claude"))
      await user.type(textarea, "Only Gemini")
      await user.click(screen.getByText("Submit"))

      expect(sendMock).toHaveBeenCalledWith({
        name: "launchQueries",
        body: { query: "Only Gemini", closePreviousTabs: false, services: ["gemini"] }
      })
    })

    it("should clear the service selection", async () => {
      render(<IndexPopup />)

      await user.click(screen.getByTestId("service-chip-grok"))
      await user.click(screen.getByText("Ask all active services"))
      expect(screen.getByTestId("service-chip-grok")).toHaveAttribute("aria-pressed", "false")
    })

    it("should submit query with keyboard shortcut (Mac)", async () => {
      render(<IndexPopup />)

      const textarea = screen.getByPlaceholderText(/Ask anything/)
      await user.type(textarea, "Test query")

      fireEvent.keyDown(textarea, { key: "Enter", metaKey: true })

      expect(sendMock).toHaveBeenCalledWith({
        name: "launchQueries",
        body: { query: "Test query", closePreviousTabs: false }
      })

      await waitFor(() => {
        expect(mockWindowClose).toHaveBeenCalled()
      })
    })

    it("should submit query with keyboard shortcut (Windows)", async () => {
      Object.defineProperty(navigator, "platform", {
        value: "Win32",
        writable: true,
        configurable: true
      })

      render(<IndexPopup />)

      const textarea = screen.getByPlaceholderText(/Ask anything/)
      await user.type(textarea, "Test query")

      fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true })

      expect(sendMock).toHaveBeenCalledWith({
        name: "launchQueries",
        body: { query: "Test query", closePreviousTabs: false }
      })

      await waitFor(() => {
        expect(mockWindowClose).toHaveBeenCalled()
      })
    })

    it("should not submit empty query", async () => {
      render(<IndexPopup />)

      const submitButton = screen.getByText("Submit")
      await user.click(submitButton)

      expect(sendMock).not.toHaveBeenCalled()
      expect(mockWindowClose).not.toHaveBeenCalled()
    })

    it("should trim whitespace from query", async () => {
      render(<IndexPopup />)

      const textarea = screen.getByPlaceholderText(/Ask anything/)
      const submitButton = screen.getByText("Submit")

      await user.type(textarea, "   ")
      await user.click(submitButton)

      expect(sendMock).not.toHaveBeenCalled()
    })

    it("should disable submit when no services enabled", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockImplementationOnce(
        (_keys, callback: (value: unknown) => void) => {
          callback({
            enabledServices: {
              chatgpt: false,
              grok: false,
              gemini: false,
              perplexity: false,
              claude: false
            },
            continuousMode: false,
            integrationMode: false
          })
          return Promise.resolve()
        }
      )

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText("Submit")).toBeDisabled()
      })
    })

    it("should show loading state and close popup after submission", async () => {
      sendMock.mockResolvedValue({ status: "success" })

      render(<IndexPopup />)

      const textarea = screen.getByPlaceholderText(/Ask anything/)
      const submitButton = screen.getByText("Submit")

      await user.type(textarea, "Test query")
      await user.click(submitButton)

      // Fire-and-forget: loading state appears immediately
      expect(screen.getByText("Launching...")).toBeInTheDocument()

      // Popup closes via setTimeout(150ms)
      await waitFor(() => {
        expect(mockWindowClose).toHaveBeenCalled()
      })
    })

    it("should log errors but still close popup (fire-and-forget)", async () => {
      sendMock.mockRejectedValue(new Error("Network error"))
      const consoleSpy = jest.spyOn(console, "error").mockImplementation()

      render(<IndexPopup />)

      const textarea = screen.getByPlaceholderText(/Ask anything/)

      await user.type(textarea, "Test query")
      await user.click(screen.getByText("Submit"))

      // Fire-and-forget: popup closes regardless of background errors
      await waitFor(() => {
        expect(mockWindowClose).toHaveBeenCalled()
      })

      // The rejection is handled asynchronously via .catch()
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Error sending query to background:",
          expect.any(Error)
        )
      })

      consoleSpy.mockRestore()
    })
  })

  describe("settings", () => {
    it("should open options page when settings clicked", async () => {
      render(<IndexPopup />)

      const settingsButton = screen.getByTitle("Settings")
      await user.click(settingsButton)

      expect(chrome.runtime.openOptionsPage).toHaveBeenCalled()
    })

    it("should load saved services configuration", async () => {
      const customServices = {
        chatgpt: false,
        grok: true,
        gemini: false,
        perplexity: true,
        claude: false
      }

      ;(chrome.storage.sync.get as jest.Mock).mockImplementationOnce(
        (_keys, callback: (value: unknown) => void) => {
          callback({
            enabledServices: customServices,
            continuousMode: true,
            integrationMode: true
          })
          return Promise.resolve()
        }
      )

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText("2 services active")).toBeInTheDocument()
        expect(screen.getByText("Grok")).toBeInTheDocument()
        expect(screen.getByText("Perplexity")).toBeInTheDocument()
        const continuousCheckbox = screen.getByRole("checkbox", { name: /continuous/i })
        const integrationCheckbox = screen.getByRole("checkbox", { name: /integrated/i })
        expect(continuousCheckbox).toBeChecked()
        expect(integrationCheckbox).toBeChecked()
      })
    })

    it("should use default services if none saved", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockImplementationOnce(
        (_keys, callback: (value: unknown) => void) => {
          callback({})
          return Promise.resolve()
        }
      )

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText("5 services active")).toBeInTheDocument()
      })
    })
  })

  describe("no services warning", () => {
    it("should show warning when no services enabled", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockImplementationOnce(
        (_keys, callback: (value: unknown) => void) => {
          callback({
            enabledServices: {
              chatgpt: false,
              grok: false,
              gemini: false,
              perplexity: false,
              claude: false
            }
          })
          return Promise.resolve()
        }
      )

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText("No services enabled.")).toBeInTheDocument()
        expect(screen.getByText("Enable services")).toBeInTheDocument()
      })
    })

    it("should open options when enable services clicked", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockImplementationOnce(
        (_keys, callback: (value: unknown) => void) => {
          callback({
            enabledServices: {
              chatgpt: false,
              grok: false,
              gemini: false,
              perplexity: false,
              claude: false
            }
          })
          return Promise.resolve()
        }
      )

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText("Enable services")).toBeInTheDocument()
      })

      const enableButton = screen.getByText("Enable services")
      await user.click(enableButton)

      expect(chrome.runtime.openOptionsPage).toHaveBeenCalled()
    })
  })

  describe("textarea behavior", () => {
    it("should update query state as user types", async () => {
      render(<IndexPopup />)

      const textarea = screen.getByPlaceholderText(/Ask anything/)
      await user.type(textarea, "Hello AI")

      expect(textarea).toHaveValue("Hello AI")
    })

    it("should not submit on Enter without modifier", async () => {
      render(<IndexPopup />)

      const textarea = screen.getByPlaceholderText(/Ask anything/)
      await user.type(textarea, "Test")

      fireEvent.keyDown(textarea, { key: "Enter" })

      expect(sendMock).not.toHaveBeenCalled()
    })

    it("should allow multiline input", async () => {
      render(<IndexPopup />)

      const textarea = screen.getByPlaceholderText(/Ask anything/)
      await user.type(textarea, "Line 1{Enter}Line 2")

      expect(textarea).toHaveValue("Line 1\nLine 2")
    })
  })

  describe("image attachments", () => {
    it("should load cached images from storage", async () => {
      ;(chrome.storage.local.get as jest.Mock).mockImplementation(
        (keys, callback: (value: unknown) => void) => {
          callback({
            cachedQuery: "Explain this diagram",
            cachedImages: [
              {
                id: "img_1",
                name: "diagram.png",
                type: "image/png",
                dataUrl: "data:image/png;base64,test",
                size: 1024
              }
            ]
          })
        }
      )

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText(/Attached \(1\)/)).toBeInTheDocument()
      })
      expect(screen.getByAltText("diagram.png")).toBeInTheDocument()
    })

    it("should include images in launchQueries payload upon submit", async () => {
      ;(chrome.storage.local.get as jest.Mock).mockImplementation(
        (keys, callback: (value: unknown) => void) => {
          callback({
            cachedQuery: "Analyze these charts",
            cachedImages: [
              {
                id: "img_1",
                name: "chart.png",
                type: "image/png",
                dataUrl: "data:image/png;base64,abc123",
                size: 2048
              }
            ]
          })
        }
      )

      render(<IndexPopup />)

      await waitFor(() => {
        expect(screen.getByText(/Attached \(1\)/)).toBeInTheDocument()
      })

      const submitButton = screen.getByRole("button", { name: /Submit/i })
      await user.click(submitButton)

      expect(sendMock).toHaveBeenCalledWith({
        name: "launchQueries",
        body: {
          query: "Analyze these charts",
          closePreviousTabs: false,
          images: [
            {
              name: "chart.png",
              type: "image/png",
              dataUrl: "data:image/png;base64,abc123"
            }
          ]
        }
      })
    })
  })

  describe("Markdown clipping", () => {
    it("calls clipActiveTab when the clip button is clicked and displays success message", async () => {
      sendMock.mockResolvedValueOnce({ ok: true, fileName: "test.md" })
      render(<IndexPopup />)

      const clipButton = screen.getByTitle("Save to Markdown (.md)")
      expect(clipButton).toBeInTheDocument()

      await user.click(clipButton)

      expect(sendMock).toHaveBeenCalledWith({
        name: "clipActiveTab",
        body: {}
      })

      await waitFor(() => {
        expect(screen.getByText("Saved to Markdown!")).toBeInTheDocument()
      })
    })

    it("displays error message if clipActiveTab fails", async () => {
      sendMock.mockResolvedValueOnce({ ok: false, error: "Content script unavailable" })
      render(<IndexPopup />)

      const clipButton = screen.getByTitle("Save to Markdown (.md)")
      await user.click(clipButton)

      await waitFor(() => {
        expect(screen.getByText(/Failed to clip page: Content script unavailable/)).toBeInTheDocument()
      })
    })
  })
})
