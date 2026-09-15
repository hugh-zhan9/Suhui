import type { EntrySearchItem } from "./entry-index"
import type { FeedModel } from "@suhui/store/feed/types"
import type { SubscriptionModel } from "@suhui/store/subscription/types"

// @ts-expect-error
export interface SearchResult<T extends object, A extends object = object> extends A {
  item: T
}

export interface SearchState {
  feeds: SearchResult<FeedModel>[]
  entries: SearchResult<EntrySearchItem, { feedId: string }>[]
  subscriptions: SearchResult<SubscriptionModel, { feedId: string }>[]

  keyword: string
  pending: boolean
  error: string | null
}
export interface SearchInstance {
  search: (keyword: string) => Promise<SearchState>
  dispose: () => void

  counts: {
    feeds: number
    entries: number
    subscriptions: number
  }
}
