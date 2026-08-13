import type { EntrySchema } from "@suhui/database/schemas/types"

export const entryListDefaultLimit = 20
export const entryListMaxLimit = 100

export type EntryListScope =
  | { kind: "timeline"; view?: number; excludePrivate?: boolean }
  | { kind: "feeds"; feedIds: string[] }
  | { kind: "list"; listId: string }
  | { kind: "inbox"; inboxId: string }
  | { kind: "collection"; view?: number }

export type EntryListQuery = {
  scope: EntryListScope
  read?: boolean
  includeHidden?: boolean
  deduplicate?: boolean
  limit?: number
  cursor?: string
}

export type EntrySummary = Pick<
  EntrySchema,
  | "id"
  | "title"
  | "url"
  | "description"
  | "guid"
  | "author"
  | "authorUrl"
  | "authorAvatar"
  | "insertedAt"
  | "publishedAt"
  | "media"
  | "categories"
  | "attachments"
  | "language"
  | "feedId"
  | "inboxHandle"
  | "read"
  | "sources"
> & {
  recordKind: "summary"
  read: boolean
  hidden?: boolean
  tags?: string[]
  cluster?: {
    id: string
    representativeEntryId: string
    sourceCount: number
    entryIds: string[]
  }
}

export type EntrySummaryPage = {
  items: EntrySummary[]
  page: {
    limit: number
    hasMore: boolean
    nextCursor: string | null
  }
}

export type EntryDetail = EntrySchema & { recordKind: "detail" }

export type DetailVisibilityPolicy = "desktop-non-deleted" | "active-relations"

export class EntryQueryError extends Error {
  constructor(
    readonly code:
      | "SUHUI_INVALID_ENTRY_SCOPE"
      | "SUHUI_INVALID_LIMIT"
      | "SUHUI_INVALID_CURSOR"
      | "SUHUI_INVALID_READ_FILTER",
    message: string,
    readonly statusCode = 400,
  ) {
    super(message)
    this.name = "EntryQueryError"
  }
}

export const normalizeEntryListLimit = (value: unknown): number => {
  if (value === undefined) return entryListDefaultLimit
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > entryListMaxLimit
  ) {
    throw new EntryQueryError(
      "SUHUI_INVALID_LIMIT",
      `limit must be an integer from 1 through ${entryListMaxLimit}`,
    )
  }
  return value
}
