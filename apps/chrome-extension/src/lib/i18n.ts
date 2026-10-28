export const i18n = (messageName: string, substitutions?: string[]): string => {
  if (chrome && chrome.i18n && chrome.i18n.getMessage) {
    return chrome.i18n.getMessage(messageName, substitutions) || messageName
  }
  return messageName
}

export const i18nCount = (messageName: string, count: number): string => {
  return i18n(messageName, [count.toString()])
}