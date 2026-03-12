import { EntryService } from "@follow/database/services/entry"
import { FeedService } from "@follow/database/services/feed"
import { SubscriptionService } from "@follow/database/services/subscription"
import type { EntryModel } from "@follow/store/entry/types"
import type { FeedModel } from "@follow/store/feed/types"
import { dbStoreMorph } from "@follow/store/morph/db-store"
import type { SubscriptionModel } from "@follow/store/subscription/types"
import { getStorageNS } from "@follow/utils/ns"
import type { IFuseOptions } from "fuse.js"
import Fuse from "fuse.js"
import { useAtomValue } from "jotai"
import { atomWithStorage } from "jotai/utils"

import { jotaiStore } from "~/lib/jotai"

import { createZustandStore } from "../utils/helper"
import { SearchType } from "./constants"
import { defineSearchInstance } from "./helper"
import type { SearchResult, SearchState } from "./types"

const searchTypeAtom = atomWithStorage<SearchType>(
  getStorageNS("search-type"),
  SearchType.Feed,
  undefined,
  { getOnInit: true },
)
const createState = (): SearchState => ({
  feeds: [],
  entries: [],
  subscriptions: [],
  keyword: "",
})
export const useSearchStore = createZustandStore<SearchState>("search")(createState)

const { getState: get, setState: set } = useSearchStore

class SearchActions {
  reset() {
    set(createState)
  }

  private createFuse<T extends object>(data: T[], keys: (keyof T)[]) {
    const options: IFuseOptions<T> = {
      keys: keys as any,
    }
    const index = Fuse.createIndex(options.keys!, data)
    return new Fuse(data, options, index)
  }

  async createLocalDbSearch() {
    const [rawEntries, rawFeeds, subscriptions] = await Promise.all([
      EntryService.getEntryAll(),
      FeedService.getFeedAll(),
      SubscriptionService.getSubscriptionAll(),
    ])

    const entries = rawEntries.map((entry) => dbStoreMorph.toEntryModel(entry))
    const feeds = rawFeeds.map((feed) => {
      const { updatedAt } = feed as { updatedAt?: number | Date | null }
      const normalizedUpdatedAt =
        updatedAt === null || updatedAt === undefined
          ? updatedAt
          : updatedAt instanceof Date
            ? updatedAt.getTime()
            : updatedAt

      return {
        ...feed,
        updatedAt: normalizedUpdatedAt,
        type: "feed" as const,
      } satisfies FeedModel
    })

    const feedsMap = new Map(feeds.map((feed) => [feed.id, feed]))

    const entriesFuse = this.createFuse(entries, ["title", "content", "description", "id"])
    const feedsFuse = this.createFuse(feeds, ["title", "description", "id", "siteUrl", "url"])
    const subscriptionsFuse = this.createFuse(subscriptions, ["title", "category"])

    return defineSearchInstance({
      counts: {
        entries: entries.length,
        feeds: feeds.length,
        subscriptions: subscriptions.length,
      },
      search(keyword: string) {
        const type = jotaiStore.get(searchTypeAtom)
        const entries = type & SearchType.Entry ? entriesFuse.search(keyword) : []
        const feeds = type & SearchType.Feed ? feedsFuse.search(keyword) : []

        const subscriptions =
          type & SearchType.Subscription ? subscriptionsFuse.search(keyword) : []

        const processedEntries = [] as SearchResult<EntryModel, { feedId: string }>[]
        for (const entry of entries) {
          const feedId = entry.item.feedId ? feedsMap.get(entry.item.feedId)?.id : undefined
          if (feedId) {
            processedEntries.push({ item: entry.item, feedId })
          }
        }

        const processedSubscriptions = [] as SearchResult<SubscriptionModel, { feedId: string }>[]
        for (const subscription of subscriptions) {
          const { feedId } = subscription.item
          if (feedId) {
            processedSubscriptions.push({ item: subscription.item, feedId })
          }
        }

        set({
          keyword,
          entries: processedEntries,
          feeds,
          subscriptions: processedSubscriptions,
        })

        jotaiStore.set(searchTypeAtom, type)

        return get()
      },
    })
  }

  setSearchType(type: SearchType) {
    jotaiStore.set(searchTypeAtom, type)
  }

  getCurrentKeyword() {
    return get().keyword
  }
}
export const useSearchType = () => useAtomValue(searchTypeAtom)
export const searchActions = new SearchActions()
