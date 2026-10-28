export type ServiceType = "chatgpt" | "grok" | "gemini" | "perplexity" | "claude"

export interface IntegrationResponse {
  service: ServiceType
  content: string
  timestamp: number
}

export interface IntegrationComparison {
  service: ServiceType
  highlights: string[]
}

export interface IntegrationSummary {
  combined: string
  comparison: IntegrationComparison[]
}

export interface IntegrationSession {
  id: string
  query: string
  createdAt: number
  updatedAt: number
  services: ServiceType[]
  responses: Partial<Record<ServiceType, IntegrationResponse>>
  summary?: IntegrationSummary
}

const STORAGE_KEY = "integrationSessions"
const CURRENT_SESSION_KEY = "currentIntegrationSessionId"
const SESSION_LIMIT = 10

const sentenceSeparator = /(?<=[.!?。？！])\s+/u

const normalizeWhitespace = (value: string) => value.replace(/\s+/gu, " ").trim()

const extractSentences = (value: string) => {
  const normalized = normalizeWhitespace(value)
  if (!normalized) {
    return [] as string[]
  }
  const segments = normalized.split(sentenceSeparator)
  const cleaned = segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0)
  if (cleaned.length > 0) {
    return cleaned
  }
  const lines = normalized.split(/\n+/u).map((line) => line.trim()).filter((line) => line.length > 0)
  return lines
}

const buildHighlights = (content: string) => extractSentences(content).slice(0, 2)

const buildCombinedSummary = (comparison: IntegrationComparison[]) => {
  const collected: string[] = []
  comparison.forEach((item) => {
    item.highlights.forEach((highlight) => {
      const normalized = normalizeWhitespace(highlight)
      if (!normalized) {
        return
      }
      const exists = collected.some((existing) => existing.toLowerCase() === normalized.toLowerCase())
      if (!exists) {
        collected.push(normalized)
      }
    })
  })
  return collected.slice(0, 5).join(" ")
}

const getSessions = async () => {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const stored = result[STORAGE_KEY] as IntegrationSession[] | undefined
  if (!stored) {
    return [] as IntegrationSession[]
  }
  return stored
}

const setSessions = async (sessions: IntegrationSession[]) => {
  await chrome.storage.local.set({ [STORAGE_KEY]: sessions })
}

export const createIntegrationSession = async (query: string, services: ServiceType[]) => {
  const session: IntegrationSession = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    query,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    services,
    responses: {}
  }
  const sessions = await getSessions()
  const updated = [session, ...sessions].slice(0, SESSION_LIMIT)
  await setSessions(updated)
  await chrome.storage.session.set({ [CURRENT_SESSION_KEY]: session.id })
  return session.id
}

export const getCurrentIntegrationSessionId = async () => {
  const result = await chrome.storage.session.get(CURRENT_SESSION_KEY)
  const value = result[CURRENT_SESSION_KEY]
  if (typeof value === "string") {
    return value
  }
  return null
}

const updateSessionSummary = (session: IntegrationSession) => {
  const comparison = session.services
    .map((service) => {
      const response = session.responses[service]
      if (!response) {
        return null
      }
      const highlights = buildHighlights(response.content)
      if (highlights.length === 0) {
        return null
      }
      return {
        service,
        highlights
      } as IntegrationComparison
    })
    .filter((item): item is IntegrationComparison => item !== null)
  if (comparison.length === 0) {
    session.summary = undefined
    return
  }
  session.summary = {
    combined: buildCombinedSummary(comparison),
    comparison
  }
}

export const recordIntegrationResponse = async (sessionId: string, service: ServiceType, content: string) => {
  const trimmed = normalizeWhitespace(content)
  if (!trimmed) {
    return
  }
  const sessions = await getSessions()
  const index = sessions.findIndex((item) => item.id === sessionId)
  if (index === -1) {
    return
  }
  const session = sessions[index]
  session.responses = {
    ...session.responses,
    [service]: {
      service,
      content: trimmed,
      timestamp: Date.now()
    }
  }
  session.updatedAt = Date.now()
  updateSessionSummary(session)
  const updated = [...sessions]
  updated[index] = session
  await setSessions(updated)
}

export const clearCurrentIntegrationSession = async () => {
  await chrome.storage.session.remove(CURRENT_SESSION_KEY)
}

export const getIntegrationSessions = getSessions
