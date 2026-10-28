export type MessagePayload<T = unknown> = {
  name?: string
  body: T
  sender?: any
}

export type MessageResponse<T = unknown> = {
  send: (data: T) => void
}

export async function sendToBackground<TResponse = unknown, TBody = unknown>(message: {
  name: string
  body: TBody
}): Promise<TResponse> {
  return chrome.runtime.sendMessage(message)
}
