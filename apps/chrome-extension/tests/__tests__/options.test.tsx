import React from "react"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import OptionsPage from "../../src/options"

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

describe("OptionsPage", () => {
  const user = userEvent.setup()

  beforeEach(() => {
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
          launchMode: "tabGroup",
          useTabGroups: true,
          continuousMode: false,
          integrationMode: false
        })
        return Promise.resolve()
      }
    )
    ;(chrome.storage.sync.set as jest.Mock).mockResolvedValue(undefined)
    ;(chrome.storage.local.get as jest.Mock).mockImplementation(
      (_keys, callback: (value: unknown) => void) => {
        callback({ integrationSessions: [] })
        return Promise.resolve()
      }
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe("rendering", () => {
    it("should render all service toggles", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("ChatGPT")).toBeInTheDocument()
        expect(screen.getByText("Grok")).toBeInTheDocument()
        expect(screen.getByText("Google Gemini")).toBeInTheDocument()
        expect(screen.getByText("Perplexity AI")).toBeInTheDocument()
        expect(screen.getByText("Claude")).toBeInTheDocument()
      })
    })

    it("should render launch and mode controls", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("Enable Tab Groups")).toBeInTheDocument()
        expect(screen.getByText("Tab Groups")).toBeInTheDocument()
        expect(screen.getByText("Tiled Windows")).toBeInTheDocument()
        expect(screen.getByText("Individual Tabs")).toBeInTheDocument()
        expect(screen.getByText("Continuous conversation")).toBeInTheDocument()
        expect(screen.getByText("Integrated summary")).toBeInTheDocument()
        expect(
          screen.getByText(
            "No integrated responses yet. Ask a question with integrated summary enabled."
          )
        ).toBeInTheDocument()
      })
    })

    it("should load saved settings from storage", async () => {
      ;(chrome.storage.sync.get as jest.Mock).mockImplementationOnce(
        (_keys, callback: (value: unknown) => void) => {
          callback({
            enabledServices: {
              chatgpt: true,
              grok: false,
              gemini: false,
              perplexity: true,
              claude: false
            },
            launchMode: "windows",
            useTabGroups: false,
            continuousMode: true,
            integrationMode: true
          })
          return Promise.resolve()
        }
      )

      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("2/5")).toBeInTheDocument()
        const windowsRadio = screen
          .getByLabelText(/Tiled Windows/i)
          .closest("label")
          ?.querySelector('input[type="radio"]')
        expect(windowsRadio).toBeChecked()
        const tabGroupToggle = screen
          .getByText("Enable Tab Groups")
          .parentElement?.parentElement?.querySelector("button")
        const continuousToggle = screen
          .getByText("Continuous conversation")
          .parentElement?.parentElement?.querySelector("button")
        const integrationToggle = screen
          .getByText("Integrated summary")
          .parentElement?.parentElement?.querySelector("button")
        expect(tabGroupToggle).toHaveAttribute("aria-checked", "false")
        expect(continuousToggle).toHaveAttribute("aria-checked", "true")
        expect(integrationToggle).toHaveAttribute("aria-checked", "true")
      })
    })
  })

  describe("service toggles", () => {
    it("should toggle service on/off", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("ChatGPT")).toBeInTheDocument()
      })

      const chatGPTCard = screen
        .getByText("ChatGPT")
        .closest('[data-service]')
      const toggleButton = chatGPTCard?.querySelector(
        'button[role="switch"]'
      )

      expect(toggleButton).toBeInTheDocument()
      await user.click(toggleButton as Element)

      expect(screen.getByText("4/5")).toBeInTheDocument()
    })

    it("should update enabled/disabled status text", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("ChatGPT")).toBeInTheDocument()
      })

      const chatGPTCard = screen
        .getByText("ChatGPT")
        .closest('[data-service]')
      expect(chatGPTCard).toHaveTextContent("Enabled")

      const toggleButton = chatGPTCard?.querySelector(
        'button[role="switch"]'
      )
      await user.click(toggleButton as Element)

      expect(chatGPTCard).toHaveTextContent("Disabled")
    })
  })

  describe("launch mode selection", () => {
    it("should select different launch modes", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("Tab Groups")).toBeInTheDocument()
      })

      const windowsRadio = screen.getByLabelText(/Tiled Windows/i)
      await user.click(windowsRadio)

      expect(windowsRadio).toBeChecked()
    })

    it("should maintain launch mode selection", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("Tab Groups")).toBeInTheDocument()
      })

      const tabsRadio = screen.getByLabelText(/Individual Tabs/i)
      await user.click(tabsRadio)

      expect(tabsRadio).toBeChecked()
      const tabGroupsRadio = screen.getByRole("radio", { name: /Tab Groups/i })
      expect(tabGroupsRadio).not.toBeChecked()
    })
  })

  describe("saving settings", () => {
    it("should save settings when save button is clicked", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("Save Settings")).toBeInTheDocument()
      })

      const saveButton = screen.getByText("Save Settings")
      await user.click(saveButton)

      expect(chrome.storage.sync.set).toHaveBeenNthCalledWith(1, {
        enabledServices: {
          chatgpt: true,
          grok: true,
          gemini: true,
          perplexity: true,
          claude: true
        },
        launchMode: "tabGroup"
      })
      expect(chrome.storage.sync.set).toHaveBeenNthCalledWith(2, {
        useTabGroups: true
      })
      expect(chrome.storage.sync.set).toHaveBeenNthCalledWith(3, {
        continuousMode: false,
        integrationMode: false
      })

      await waitFor(() => {
        expect(
          screen.getByText("Settings saved successfully!")
        ).toBeInTheDocument()
      })
    })

    it("should save updated settings", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("ChatGPT")).toBeInTheDocument()
      })

      const chatGPTCard = screen
        .getByText("ChatGPT")
        .closest('[data-service]')
      const toggleButton = chatGPTCard?.querySelector(
        'button[role="switch"]'
      )
      await user.click(toggleButton as Element)

      const windowsRadio = screen.getByLabelText(/Tiled Windows/i)
      await user.click(windowsRadio)

      const saveButton = screen.getByText("Save Settings")
      await user.click(saveButton)

      expect(chrome.storage.sync.set).toHaveBeenNthCalledWith(1, {
        enabledServices: {
          chatgpt: false,
          grok: true,
          gemini: true,
          perplexity: true,
          claude: true
        },
        launchMode: "windows"
      })
      expect(chrome.storage.sync.set).toHaveBeenNthCalledWith(2, {
        useTabGroups: true
      })
      expect(chrome.storage.sync.set).toHaveBeenNthCalledWith(3, {
        continuousMode: false,
        integrationMode: false
      })
    })

    it("should show saving state", async () => {
      ;(chrome.storage.sync.set as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("Save Settings")).toBeInTheDocument()
      })

      const saveButton = screen.getByRole("button", { name: /save settings/i })
      await user.click(saveButton)

      expect(screen.getByText("Saving...")).toBeInTheDocument()
      expect(saveButton).toBeDisabled()

      await waitFor(() => {
        expect(screen.getByText("Save Settings")).toBeInTheDocument()
        expect(saveButton).not.toBeDisabled()
      })
      expect(chrome.storage.sync.set).toHaveBeenCalledTimes(3)
    })

    it("should handle save errors", async () => {
      ;(chrome.storage.sync.set as jest.Mock).mockRejectedValue(
        new Error("Save failed")
      )

      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("Save Settings")).toBeInTheDocument()
      })

      const saveButton = screen.getByText("Save Settings")
      await user.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText("Error saving settings")).toBeInTheDocument()
      })
    })

    it("should clear message after timeout", async () => {
      jest.useFakeTimers()

      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("Save Settings")).toBeInTheDocument()
      })

      const saveButton = screen.getByText("Save Settings")
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(
          screen.getByText("Settings saved successfully!")
        ).toBeInTheDocument()
      })

      await act(async () => {
        jest.advanceTimersByTime(3000)
      })

      await waitFor(() => {
        expect(
          screen.queryByText("Settings saved successfully!")
        ).not.toBeInTheDocument()
      })

      jest.useRealTimers()
    })
  })

  describe("visual feedback", () => {
    it("should highlight enabled service cards", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("ChatGPT")).toBeInTheDocument()
      })

      const chatGPTCard = screen
        .getByText("ChatGPT")
        .closest('[data-service]')
      expect(
        chatGPTCard?.querySelector('button[role="switch"]')
      ).toHaveAttribute("aria-checked", "true")
    })

    it("should show recommended badge on tab groups", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("Tab Groups")).toBeInTheDocument()
      })

      const tabGroupsLabel = screen.getByText("Tab Groups").closest("div")
      expect(tabGroupsLabel).toHaveTextContent("Recommended")
    })

    it("should show active indicator for enabled services", async () => {
      render(<OptionsPage />)

      await waitFor(() => {
        expect(screen.getByText("ChatGPT")).toBeInTheDocument()
      })

      const chatGPTCard = screen
        .getByText("ChatGPT")
        .closest('[data-service]')
      expect(chatGPTCard).toHaveTextContent("Enabled")
    })
  })
})
