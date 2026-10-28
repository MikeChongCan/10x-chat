import { defineConfig } from "wxt"

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "__MSG_extensionName__",
    description: "__MSG_extensionDescription__",
    default_locale: "en",
    permissions: [
      "storage",
      "tabs",
      "tabGroups",
      "system.display",
      "downloads",
      "activeTab",
      "scripting",
      "contextMenus"
    ],
    commands: {
      "clip-to-markdown": {
        suggested_key: {
          default: "Alt+Shift+M",
          mac: "Alt+Shift+M"
        },
        description: "Save active tab to Markdown (.md)"
      }
    },
    host_permissions: [
      "https://gemini.google.com/*",
      "https://chatgpt.com/*",
      "https://www.chatgpt.com/*",
      "https://claude.ai/*",
      "https://perplexity.ai/*",
      "https://www.perplexity.ai/*",
      "https://grok.com/*"
    ],
    action: {
      default_title: "__MSG_extensionName__"
    },
    icons: {
      16: "icon.png",
      32: "icon.png",
      48: "icon.png",
      128: "icon.png"
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true
    }
  }
})
