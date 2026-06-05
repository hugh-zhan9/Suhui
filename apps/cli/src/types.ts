export const defaultOutputFormat = "markdown" as const
export const defaultMaxChars = 12_000

export const outputFormats = ["markdown", "json"] as const

export type OutputFormat = (typeof outputFormats)[number]

export type ContentMode = "full" | "summary" | "metadata"

export const exitCodes = {
  success: 0,
  error: 1,
  remoteUnavailable: 2,
  notFound: 3,
  unexpectedResponse: 4,
} as const

export type ExitCode = (typeof exitCodes)[keyof typeof exitCodes]

export type CliErrorCode =
  | "SUHUI_USAGE_ERROR"
  | "SUHUI_REMOTE_UNAVAILABLE"
  | "SUHUI_NOT_FOUND"
  | "SUHUI_UNEXPECTED_RESPONSE"
  | "SUHUI_EXECUTION_ERROR"

export class CliError extends Error {
  constructor(
    readonly code: CliErrorCode,
    message: string,
    readonly exitCode: ExitCode,
  ) {
    super(message)
    this.name = "CliError"
  }
}

export type CliCommand =
  | {
      kind: "entries.list"
      baseUrl: string
      format: OutputFormat
      feedId?: string
      read?: boolean
      limit?: number
      cursor?: string
      withSummary: boolean
    }
  | {
      kind: "entries.get"
      baseUrl: string
      format: OutputFormat
      entryId: string
      content: ContentMode
      maxChars: number
    }
  | {
      kind: "feeds.list"
      baseUrl: string
      format: OutputFormat
    }
  | {
      kind: "entries.read"
      baseUrl: string
      format: OutputFormat
      entryIds: string[]
      read: boolean
    }

export type AgentFormatTimestamp = number | null

export type AgentEntryContentSource = "readabilityContent" | "content" | "description" | "none"

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

export type AgentErrorBody = {
  error: {
    code: string
    message: string
  }
}

export type AgentSuccessEnvelope<T> = {
  data: T
}

export type AgentFailureEnvelope = AgentErrorBody
