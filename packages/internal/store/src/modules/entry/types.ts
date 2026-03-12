import type { FeedViewType } from "@follow/constants"
import type { EntrySchema } from "@follow/database/schemas/types"

export type EntryModel = Omit<
  EntrySchema,
  "insertedAt" | "publishedAt" | "readabilityUpdatedAt"
> & {
  insertedAt: number
  publishedAt: number
  readabilityUpdatedAt: number | null
}
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
  queryKey?: (string | number | boolean | string[] | undefined)[]
}

export type UseEntriesControl = Pick<
  UseEntriesReturn,
  "fetchNextPage" | "isFetching" | "refetch" | "isRefetching" | "hasNextPage"
>
