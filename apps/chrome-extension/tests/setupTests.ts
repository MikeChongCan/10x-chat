import '@testing-library/jest-dom'

// Mock chrome API
global.chrome = {
  runtime: {
    openOptionsPage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn(),
    },
  },
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    },
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    },
  },
  tabs: {
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    query: jest.fn(),
    get: jest.fn(),
    remove: jest.fn(),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    group: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
  tabGroups: {
    update: jest.fn(),
    query: jest.fn(),
    get: jest.fn(),
  },
  windows: {
    create: jest.fn(),
    update: jest.fn(),
    get: jest.fn(),
    getAll: jest.fn(),
    remove: jest.fn(),
  },
  system: {
    display: {
      getInfo: jest.fn(),
    },
  },
  downloads: {
    download: jest.fn().mockResolvedValue(1),
  },
  scripting: {
    executeScript: jest.fn().mockResolvedValue([]),
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
  commands: {
    onCommand: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
} as any

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
})