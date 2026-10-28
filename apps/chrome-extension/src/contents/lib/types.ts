/** AI service names supported by the extension */
export type ServiceName =
  | "chatgpt"
  | "grok"
  | "gemini"
  | "perplexity"
  | "claude"

/** Message sent from content scripts to the background service worker */
export type ResponseCapturedMessage = {
  type: "AI_RESPONSE_CAPTURED"
  service: ServiceName
  content: string
  sessionId: string
}

/** Message sent from background to content scripts */
export type SetPromptMessage = {
  type: "SET_PROMPT"
  prompt: string
  autoSend?: boolean
  service?: ServiceName
  sessionId?: string
}
