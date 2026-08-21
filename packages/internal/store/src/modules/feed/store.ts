import type { FeedSchema } from "@suhui/database/schemas/types"
import { FEED_EXTRA_DATA_KEYS, FeedService } from "@suhui/database/services/feed"
import { isBizId } from "@suhui/utils"

import { markFeedHydrateDirty, reconcileHydratedFeed } from "../../hydrate-phases"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { runtimeClient } from "../../runtime"
import { useEntryStore } from "../entry/base"
import { shouldTreatFeedAsRemoteBiz } from "./local-feed"
import type { FeedModel } from "./types"

interface FeedState {
  feeds: Record<string, FeedModel>
}

const initialFeedStore: FeedState = {
  feeds: {},
}

export const useFeedStore = createZustandStore<FeedState>("feed")(() => initialFeedStore)

const get = useFeedStore.getState
const set = useFeedStore.setState
const immerSet = createImmerSetter(useFeedStore)

export const shouldSkipIdOnlyPreview = ({
  id,
  url,
  hasExisting,
}: {
  id?: string
  url?: string
  hasExisting: boolean
}) => {
  return !!id && isBizId(id) && !url && !hasExisting
}

export const shouldReturnExistingFeedDirectly = ({
  existing,
  hasEntryCache,
}: {
  existing?: Pick<FeedModel, "url"> | null
  hasEntryCache: boolean
}) => {
  return !!existing && (hasEntryCache || !existing.url)
}

const hasEntryCacheByFeedId = (feedId?: string) => {
  if (!feedId) return false
  const entrySet = useEntryStore.getState().entryIdByFeed[feedId]
  return !!entrySet && entrySet.size > 0
}

type FeedWithNormalizedUpdatedAt = Omit<FeedSchema, "updatedAt"> & {
  updatedAt?: number | null
}

type FeedRow = Omit<FeedSchema, "updatedAt"> & {
  updatedAt?: number | Date | null
}

const normalizeFeedTimestamp = (feed: FeedRow): FeedWithNormalizedUpdatedAt => {
  const { updatedAt } = feed
  const normalizedUpdatedAt =
    updatedAt === null || updatedAt === undefined
      ? updatedAt
      : updatedAt instanceof Date
        ? updatedAt.getTime()
        : updatedAt

  return {
    ...feed,
    updatedAt: normalizedUpdatedAt,
  }
}
// const get = useFeedStore.getState
// const distanceTime = 1000 * 60 * 60 * 9
class FeedActions implements Hydratable, Resetable {
  async hydrate() {
    const feeds = await FeedService.getFeedAll()
    this.restoreHydratedSnapshotInSession(
      feeds.map((feed) => normalizeFeedTimestamp(feed as FeedSchema)),
    )
  }

  private buildFeedRecord(rawFeed: FeedSchema, currentFeed?: FeedModel): FeedModel {
    const feed = normalizeFeedTimestamp(rawFeed)
    const data = Object.fromEntries(
      FEED_EXTRA_DATA_KEYS.filter((key) => (currentFeed || {})[key]).map((key) => [
        key,
        currentFeed?.[key],
      ]),
    )

    return reconcileHydratedFeed(
      {
        ...feed,
        ...data,
        type: "feed",
      },
      currentFeed,
    )
  }

  restoreHydratedSnapshotInSession(feeds: FeedSchema[]) {
    immerSet((draft) => {
      const currentFeeds = draft.feeds
      draft.feeds = {}

      for (const rawFeed of feeds) {
        const feed = normalizeFeedTimestamp(rawFeed)
        draft.feeds[feed.id] = this.buildFeedRecord(feed as FeedSchema, currentFeeds[feed.id])
      }
    })
  }

  upsertManyInSession(feeds: FeedSchema[]) {
    immerSet((draft) => {
      for (const rawFeed of feeds) {
        const feed = normalizeFeedTimestamp(rawFeed)
        draft.feeds[feed.id] = this.buildFeedRecord(feed as FeedSchema, draft.feeds[feed.id])
      }
    })
  }

  async upsertMany(feeds: FeedSchema[]) {
    if (feeds.length === 0) return

    const tx = createTransaction()
    tx.store(() => {
      this.upsertManyInSession(feeds)
    })

    tx.persist(async () => {
      await FeedService.upsertMany(feeds.filter((feed) => !("nonce" in feed)))
    })

    await tx.run()
  }

  patchInSession(feedId: string, patch: Partial<FeedSchema>) {
    immerSet((state) => {
      const feed = state.feeds[feedId]
      if (!feed) return
      if (patch.title !== undefined && patch.title !== feed.title) {
        markFeedHydrateDirty(feedId)
      }
      Object.assign(feed, patch)
    })
  }

  async patch(feedId: string, patch: Partial<FeedSchema>) {
    const tx = createTransaction()
    tx.store(() => {
      this.patchInSession(feedId, patch)
    })
    tx.persist(() => {
      return FeedService.patch(feedId, patch)
    })
    await tx.run()
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(initialFeedStore)
    })

    tx.persist(() => {
      return FeedService.purgeAllForMaintenance()
    })

    await tx.run()
  }
}

type FeedQueryParams = {
  id?: string
  url?: string
}

class FeedSyncServices {
  async fetchFeedById({ id, url }: FeedQueryParams) {
    const existing = id ? get().feeds[id!] : undefined
    const isFeedId = shouldTreatFeedAsRemoteBiz({ id, feed: existing })

    // If we have a feed by id in the store, return it directly
    const hasEntryCache = hasEntryCacheByFeedId(id)
    if (
      shouldSkipIdOnlyPreview({
        id,
        url,
        hasExisting: !!existing,
      })
    ) {
      return null
    }

    if (
      isFeedId && // Preview feed in local mode needs entries; if no cached entries, prefer re-preview by feed url.
      shouldReturnExistingFeedDirectly({
        existing,
        hasEntryCache,
      })
    ) {
      return {
        feed: existing,
        entries: [],
        subscription: undefined,
        analytics: undefined,
      }
    }

    const feedUrl = url || (isFeedId ? existing?.url : undefined) || ""

    if (!feedUrl && !isFeedId) {
      return null
    }

    try {
      const data = await runtimeClient.feeds.preview({
        url: feedUrl,
        feedId: id && isFeedId ? id : undefined,
      })
      if (!(data as any)?.feed) {
        throw new Error("Failed to preview feed via runtime service")
      }
      feedActions.upsertManyInSession([(data as any).feed])
      return data
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error("[feedSyncServices.fetchFeedById] preview failed", {
        feedUrl,
        feedId: id,
        reason,
      })
      throw new Error(`本地预览订阅失败: ${reason}`)
    }
  }
}
export const feedSyncServices = new FeedSyncServices()
export const feedActions = new FeedActions()
