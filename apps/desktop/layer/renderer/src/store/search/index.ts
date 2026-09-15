import { EntryService } from "@suhui/database/services/entry"
import { EntryAnnotationService } from "@suhui/database/services/entry-annotation"
import { EntryRuleService } from "@suhui/database/services/entry-rule"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"
import type { FeedModel } from "@suhui/store/feed/types"
import type { SubscriptionModel } from "@suhui/store/subscription/types"
import { getStorageNS } from "@suhui/utils/ns"
import type { IFuseOptions } from "fuse.js"
import Fuse from "fuse.js"
import { useAtomValue } from "jotai"
import { atomWithStorage } from "jotai/utils"

import { jotaiStore } from "~/lib/jotai"
import { normalizeRssTitleForRender } from "~/lib/rss-content-normalize"

import { createZustandStore } from "../utils/helper"
import { SEARCH_RESULT_LIMIT, SearchType } from "./constants"
import { SearchWorkerClient } from "./worker-client"
import { defineSearchInstance } from "./helper"
import type { SearchResult, SearchState } from "./types"
import type { SearchScope } from "./entry-index"

const searchScopeAtom = atomWithStorage<SearchScope>(
  getStorageNS("search-scope"),
  "all",
  undefined,
  { getOnInit: true },
)
const activeFeedIds = (
  subscriptions: Awaited<ReturnType<typeof SubscriptionService.getSubscriptionAll>>,
) =>
  new Set(
    subscriptions
      .filter((sub) => sub.type === "feed" && !sub.deletedAt && sub.feedId)
      .map((sub) => sub.feedId!),
  )

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
  pending: false,
  error: null,
})
export const useSearchStore = createZustandStore<SearchState>("search")(createState)

const { getState: get, setState: set } = useSearchStore

class SearchActions {
  private generation = 0
  private disposeActive?: () => void

  reset() {
    this.generation++
    this.disposeActive?.()
    this.disposeActive = undefined
    set(createState)
  }

  private createFuse<T extends object>(data: T[], keys: (keyof T)[], ignoreLocation = false) {
    const options: IFuseOptions<T> = {
      keys: keys as any,
      ignoreLocation,
    }
    const index = Fuse.createIndex(options.keys!, data)
    return new Fuse(data, options, index)
  }

  async createLocalDbSearch() {
    const generation = this.generation
    const [entryCount, rawFeeds, subscriptions] = await Promise.all([
      EntryService.getSearchCount(),
      FeedService.getFeedAll(),
      SubscriptionService.getSubscriptionAll(),
    ])

    const activeIds = activeFeedIds(subscriptions)
    const feeds = rawFeeds
      .filter((feed) => activeIds.has(feed.id))
      .map((feed) => {
        const { updatedAt } = feed as { updatedAt?: number | Date | null }
        const normalizedUpdatedAt =
          updatedAt === null || updatedAt === undefined
            ? updatedAt
            : updatedAt instanceof Date
              ? updatedAt.getTime()
              : updatedAt

        return {
          ...feed,
          title: normalizeRssTitleForRender(feed.title),
          updatedAt: normalizedUpdatedAt,
          type: "feed" as const,
        } satisfies FeedModel
      })

    const feedsMap = new Map(feeds.map((feed) => [feed.id, feed]))

    const feedsFuse = this.createFuse(feeds, ["title", "description", "id", "siteUrl", "url"])
    const subscriptionsFuse = this.createFuse(subscriptions, ["title", "category"])
    let worker: SearchWorkerClient | undefined
    let ready: Promise<void> | undefined
    let running: Promise<unknown> = Promise.resolve()
    let sequence = 0
    let disposed = false
    let cancelDelay: (() => void) | undefined
    const isActive = () => !disposed && generation === this.generation
    const dispose = () => {
      disposed = true
      sequence++
      cancelDelay?.()
      worker?.dispose()
    }
    if (isActive()) this.disposeActive = dispose

    const loadEntries = async () => {
      worker = new SearchWorkerClient()
      let cursor: string | undefined
      while (isActive()) {
        const page = await EntryService.getSearchPage(cursor)
        if (!isActive() || page.length === 0) return
        const ids = page.map((entry) => entry.id)
        const [notes, highlights, tags] = await Promise.all([
          EntryAnnotationService.getNotes(ids),
          EntryAnnotationService.getHighlights(ids),
          EntryRuleService.getTags(ids),
        ])
        if (!isActive()) return
        const group = <T extends { entryId: string }>(rows: T[], value: (row: T) => string) => {
          const result = new Map<string, string[]>()
          for (const row of rows) {
            const values = result.get(row.entryId) ?? []
            values.push(value(row))
            result.set(row.entryId, values)
          }
          return result
        }
        const notesByEntry = group(notes, (row) => row.content)
        const highlightsByEntry = group(highlights, (row) => row.quote)
        const tagsByEntry = group(tags, (row) => row.tag)
        await worker.add(
          page
            .filter((entry) => entry.feedId && feedsMap.has(entry.feedId))
            .map((entry) => ({
              ...entry,
              localNotes: notesByEntry.get(entry.id) ?? [],
              localHighlights: highlightsByEntry.get(entry.id) ?? [],
              localTags: tagsByEntry.get(entry.id) ?? [],
            })),
        )
        cursor = page.at(-1)!.id
      }
    }

    return defineSearchInstance({
      dispose,
      counts: { entries: entryCount, feeds: feeds.length, subscriptions: subscriptions.length },
      async search(input: string) {
        if (!isActive()) return get()
        const request = ++sequence
        cancelDelay?.()
        const keyword = input.trim()
        const type = jotaiStore.get(searchTypeAtom)
        const scope = jotaiStore.get(searchScopeAtom)
        set({ keyword, entries: [], feeds: [], subscriptions: [], pending: !!keyword, error: null })
        if (!keyword) return get()
        // Coalesce typing before doing any indexing/search work.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 200)
          cancelDelay = () => {
            clearTimeout(timer)
            resolve()
          }
        })
        const current = () => isActive() && sequence === request
        if (!current()) return get()
        try {
          if (type & SearchType.Entry) {
            ready ??= loadEntries()
            await ready
            await running.catch(() => undefined)
          }
          if (!current()) return get()
          // Recheck each query: a session index may outlive an unsubscribe.
          const currentIds = activeFeedIds(await SubscriptionService.getSubscriptionAll())
          if (!current()) return get()
          const result =
            type & SearchType.Entry
              ? worker!.search(keyword, scope, [...currentIds])
              : Promise.resolve([])
          running = result
          const items = await result
          if (!current()) return get()
          set({
            entries: items.flatMap((item) => (item.feedId ? [{ item, feedId: item.feedId }] : [])),
            feeds:
              type & SearchType.Feed
                ? feedsFuse
                    .search(keyword)
                    .filter(({ item }) => currentIds.has(item.id))
                    .slice(0, SEARCH_RESULT_LIMIT)
                : [],
            subscriptions:
              type & SearchType.Subscription
                ? subscriptionsFuse
                    .search(keyword, { limit: SEARCH_RESULT_LIMIT })
                    .flatMap(({ item }) =>
                      item.feedId && currentIds.has(item.feedId)
                        ? [
                            { item, feedId: item.feedId } as SearchResult<
                              SubscriptionModel,
                              { feedId: string }
                            >,
                          ]
                        : [],
                    )
                : [],
            pending: false,
          })
        } catch (error) {
          if (current())
            set({ pending: false, error: error instanceof Error ? error.message : String(error) })
        }
        return get()
      },
    })
  }

  setSearchType(type: SearchType) {
    jotaiStore.set(searchTypeAtom, type)
  }

  setSearchScope(scope: SearchScope) {
    jotaiStore.set(searchScopeAtom, scope)
  }

  getCurrentKeyword() {
    return get().keyword
  }
}
export const useSearchType = () => useAtomValue(searchTypeAtom)
export const useSearchScope = () => useAtomValue(searchScopeAtom)
export const searchActions = new SearchActions()
