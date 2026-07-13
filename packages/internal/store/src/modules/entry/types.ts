import type { FeedViewType } from "@suhui/constants"
import type { EntrySchema } from "@suhui/database/schemas/types"

export type EntryModel = Omit<
  EntrySchema,
  "insertedAt" | "publishedAt" | "readabilityUpdatedAt"
> & {
  insertedAt: number
  publishedAt: number
  readabilityUpdatedAt: number | null
  recordKind?: "summary" | "detail"
}

export type RuntimeEntryListScope =
  | { kind: "timeline"; view?: number; excludePrivate?: boolean }
  | { kind: "feeds"; feedIds: string[] }
  | { kind: "list"; listId: string }
  | { kind: "inbox"; inboxId: string }
  | { kind: "collection"; view?: number }

export type RuntimeEntryListQuery = {
  scope: RuntimeEntryListScope
  read?: boolean
  limit?: number
  cursor?: string
}

export type RuntimeEntryPage = {
  limit: number
  hasMore: boolean
  nextCursor: string | null
}

export type RuntimeEntrySummaryPage = {
  data: EntryModel[]
  page: RuntimeEntryPage
}

export type EntryQueryHookPage = RuntimeEntrySummaryPage
export type FetchEntriesProps = {
  feedId?: string
  feedIdList?: string[]
  inboxId?: string
  listId?: string
  view?: number
  read?: boolean
  limit?: number
  pageParam?: string
  isCollection?: boolean
  excludePrivate?: boolean
  aiSort?: boolean
}

export type FetchEntriesPropsSettings = {
  hidePrivateSubscriptionsInTimeline?: boolean
  unreadOnly?: boolean
}

export type UseEntriesProps = {
  viewId?: FeedViewType
  active?: boolean
}

export type UseEntriesReturn = {
  entriesIds: string[]
  hasNext: boolean
  refetch: () => Promise<void>
  fetchNextPage: () => Promise<void> | void
  isLoading: boolean
  isRefetching: boolean
  isReady: boolean
  isFetching: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  error: Error | null
  fetchedTime?: number
  queryKey?: readonly unknown[]
}

export type UseEntriesControl = Pick<
  UseEntriesReturn,
  "fetchNextPage" | "isFetching" | "refetch" | "isRefetching" | "hasNextPage"
>
