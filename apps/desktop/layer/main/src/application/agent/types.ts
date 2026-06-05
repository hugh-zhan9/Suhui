export const agentEntriesDefaultLimit = 20
export const agentEntriesMaxLimit = 100

export type AgentFormatTimestamp = number | null

export type AgentEntryContentSource = "readabilityContent" | "content" | "description" | "none"

export type AgentEntriesCursor = {
  publishedAt: number
  insertedAt: number
  id: string
}

export type AgentEntriesListOptions = {
  feedId?: string
  read?: boolean
  limit?: number
  cursor?: string
  withSummary?: boolean
}

export type AgentEntryListItem = {
  id: string
  feedId: string | null
  feedTitle: string
  title: string
  url: string | null
  author: string | null
  publishedAt: AgentFormatTimestamp
  publishedAtIso: string | null
  insertedAt: AgentFormatTimestamp
  insertedAtIso: string | null
  read: boolean
  summary?: string | null
}

export type AgentEntriesListResult = {
  items: AgentEntryListItem[]
  page: {
    limit: number
    nextCursor: string | null
    hasMore: boolean
  }
}

export type AgentEntryDetail = AgentEntryListItem & {
  content: string
  contentSource: AgentEntryContentSource
  description: string | null
}

export type AgentFeedListItem = {
  id: string
  subscriptionId: string
  title: string
  url: string | null
  siteUrl: string | null
  category: string | null
  unreadCount: number
}

export type AgentFeedsListResult = {
  items: AgentFeedListItem[]
}

export type AgentReadStatusResult = {
  updated: number
  read: boolean
}

export type AgentErrorCode =
  | "SUHUI_INVALID_LIMIT"
  | "SUHUI_INVALID_CURSOR"
  | "SUHUI_INVALID_READ_FILTER"
  | "SUHUI_ENTRY_NOT_FOUND"
  | "SUHUI_INVALID_ENTRY_IDS"
  | "SUHUI_AGENT_INTERNAL_ERROR"

export class AgentApplicationError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = "AgentApplicationError"
  }
}

export const toIsoString = (value: unknown): string | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString()
}

export const normalizeLimit = (value: unknown): number => {
  if (value === undefined || value === null || value === "") return agentEntriesDefaultLimit
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new AgentApplicationError("SUHUI_INVALID_LIMIT", "limit must be a number", 400)
  }
  return Math.max(1, Math.min(agentEntriesMaxLimit, Math.trunc(parsed)))
}

export const selectAgentEntryContent = (entry: {
  readabilityContent?: string | null
  content?: string | null
  description?: string | null
}): { content: string; contentSource: AgentEntryContentSource } => {
  const readabilityContent = entry.readabilityContent?.trim()
  if (readabilityContent) {
    return { content: entry.readabilityContent!, contentSource: "readabilityContent" }
  }

  const content = entry.content?.trim()
  if (content) {
    return { content: entry.content!, contentSource: "content" }
  }

  const description = entry.description?.trim()
  if (description) {
    return { content: entry.description!, contentSource: "description" }
  }

  return { content: "", contentSource: "none" }
}
