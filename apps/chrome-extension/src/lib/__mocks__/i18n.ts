export const i18n = jest.fn((key: string, values?: any[]) => {
  const translations: Record<string, string> = {
    appTitle: 'Multi-AI Chat',
    appSubtitle: 'One question, multiple AI answers',
    yourQuestions: 'Your Question',
    submitShortcut: 'Type your question... ($1 to send)',
    submit: 'Ask All AIs',
    launching: 'Launching...',
    settings: 'Settings',
    servicesActive: '$1 services active',
    servicesSelected: 'Asking only $1',
    serviceChipHint: 'Click a service to ask only it',
    serviceChipClear: 'Ask all active services',
    serviceNameChatGPT: 'ChatGPT',
    serviceNameGrok: 'Grok',
    serviceNameGemini: 'Gemini',
    serviceNamePerplexity: 'Perplexity',
    serviceNameClaude: 'Claude',
    serviceDescChatGPT: 'OpenAI ChatGPT',
    serviceDescGrok: 'xAI Grok',
    serviceDescGemini: 'Google Gemini',
    serviceDescPerplexity: 'Perplexity AI',
    serviceDescClaude: 'Anthropic Claude',
    optionsTitle: 'Multi-AI Chat Settings',
    optionsSubtitle: 'Choose which AI services to query',
    activeServices: 'Active Services',
    activeServicesDesc: 'Services that will respond to your queries',
    enabled: 'enabled',
    serviceEnabled: 'Enabled',
    serviceDisabled: 'Disabled',
    saveSettings: 'Save Settings',
    saving: 'Saving...',
    settingsSaved: 'Settings saved successfully!',
    errorSaving: 'Error saving settings',
    changesEffectNext: 'Changes will take effect on your next query',
    noServicesEnabled: 'Please enable at least one service.',
    enableServices: 'Enable services',
    launchMode: 'Launch Mode',
    launchModeDesc: 'Choose how AI services open when you submit a query',
    tabGroupMode: 'Tab Groups',
    tabGroupModeDesc: 'Opens all AI services in a single browser window, organized in a color-coded tab group',
    windowsMode: 'Tiled Windows',
    windowsModeDesc: 'Opens each AI service in a separate window, automatically arranged in a grid layout',
    tabsMode: 'Individual Tabs',
    tabsModeDesc: 'Opens each AI service in a separate tab without grouping (classic mode)',
  }
  
  let result = translations[key] || key
  if (values && values.length > 0) {
    values.forEach((value, index) => {
      result = result.replace(`$${index + 1}`, value)
    })
  }
  return result
})

export const i18nCount = jest.fn((key: string, count: number) => {
  if (key === 'servicesActive') {
    return `${count} services active`
  }
  return key
})