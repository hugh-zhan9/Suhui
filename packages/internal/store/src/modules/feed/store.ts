import type { FeedSchema } from "@follow/database/schemas/types"
import { FEED_EXTRA_DATA_KEYS, FeedService } from "@follow/database/services/feed"
import { getDateISOString, isBizId } from "@follow/utils"

import { api } from "../../context"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { whoami } from "../user/getters"
import { shouldUseElectronLocalPreview } from "./local-preview"
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
// const get = useFeedStore.getState
// const distanceTime = 1000 * 60 * 60 * 9
class FeedActions implements Hydratable, Resetable {
  async hydrate() {
    const feeds = await FeedService.getFeedAll()
    feedActions.upsertManyInSession(feeds)
  }

  upsertManyInSession(feeds: FeedSchema[]) {
    immerSet((draft) => {
      for (const feed of feeds) {
        const data = Object.fromEntries(
          FEED_EXTRA_DATA_KEYS.filter((key) => (draft.feeds[feed.id] || {})[key]).map((key) => [
            key,
            draft.feeds[feed.id]?.[key],
          ]),
        )

        draft.feeds[feed.id] = {
          ...feed,
          ...data,
          type: "feed",
        }
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
      return FeedService.reset()
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
    const isFeedId = isBizId(id)

    // If we have a feed by id in the store, return it directly
    if (isFeedId) {
      const existing = get().feeds[id!]
      if (existing) {
        return {
          feed: existing,
          entries: [],
          subscription: undefined,
          analytics: undefined,
        }
      }
    }

    if (!url && !isFeedId) {
      return null
    }

    // [Local Mode] Prefer Electron IPC local preview; fallback to web proxy.
    const feedUrl = url || ""
    if (
      shouldUseElectronLocalPreview(typeof window === "undefined" ? undefined : window, feedUrl)
    ) {
      const data = await (window as any).electron.ipcRenderer.invoke("db.previewFeed", {
        url: feedUrl,
        feedId: id && isFeedId ? id : undefined,
      })
      if (!data?.feed) {
        throw new Error("Failed to preview feed via local database")
      }
      feedActions.upsertMany([data.feed])
      return data
    }

    const proxyUrl = `/api/rss-proxy?url=${encodeURIComponent(feedUrl)}`
    const response = await fetch(proxyUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.status}`)
    }
    const xmlText = await response.text()
    const parser = new DOMParser()
    const xml = parser.parseFromString(xmlText, "text/xml")

    // Parse RSS or Atom
    const channel = xml.querySelector("rss > channel")
    const atomFeed = xml.querySelector("feed")
    const feedTitle =
      channel?.querySelector("title")?.textContent?.trim() ||
      atomFeed?.querySelector("title")?.textContent?.trim() ||
      "Untitled Feed"
    const siteUrl =
      channel?.querySelector("link")?.textContent?.trim() ||
      atomFeed?.querySelector("link[rel='alternate']")?.getAttribute("href") ||
      ""
    const description =
      channel?.querySelector("description")?.textContent?.trim() ||
      atomFeed?.querySelector("subtitle")?.textContent?.trim() ||
      ""

    const nonce = Math.random().toString(36).slice(2, 15)
    const feedId = id && isFeedId ? id : nonce

    const finalData: FeedModel = {
      type: "feed",
      id: feedId,
      title: feedTitle,
      url: feedUrl,
      description: description || null,
      image: null,
      errorAt: null,
      siteUrl: siteUrl || null,
      ownerUserId: null,
      errorMessage: null,
      subscriptionCount: null,
      updatesPerWeek: null,
      latestEntryPublishedAt: null,
      tipUserIds: null,
      updatedAt: null,
    }
    if (!id || !isFeedId) {
      ;(finalData as any)["nonce"] = nonce
    }
    feedActions.upsertMany([finalData])

    // Parse entries for preview
    const itemEls = channel
      ? Array.from(channel.querySelectorAll("item"))
      : Array.from(atomFeed?.querySelectorAll("entry") || [])
    const entries = itemEls.slice(0, 10).map((el) => {
      const entryId = Math.random().toString(36).slice(2, 15)
      const entryTitle = el.querySelector("title")?.textContent?.trim() || "Untitled"
      const entryLink =
        el.querySelector("link")?.textContent?.trim() ||
        el.querySelector("link")?.getAttribute("href") ||
        ""
      const entryDesc =
        el.querySelector("description")?.textContent?.trim() ||
        el.querySelector("summary")?.textContent?.trim() ||
        el.querySelector("content")?.textContent?.trim() ||
        ""
      const pubDateRaw =
        el.querySelector("pubDate")?.textContent?.trim() ||
        el.querySelector("published")?.textContent?.trim() ||
        el.querySelector("updated")?.textContent?.trim() ||
        ""
      const pubDate = pubDateRaw ? new Date(pubDateRaw) : new Date()
      return {
        id: entryId,
        title: entryTitle,
        url: entryLink,
        description: entryDesc,
        guid: el.querySelector("guid")?.textContent?.trim() || entryId,
        publishedAt: pubDate.toISOString(),
        feedId,
      }
    })

    return {
      feed: finalData,
      entries,
      subscription: undefined,
      analytics: {
        updatesPerWeek: null,
        subscriptionCount: null,
        latestEntryPublishedAt: entries[0]?.publishedAt || null,
        view: 1,
      },
    }
  }

  async fetchFeedByUrl({ url }: FeedQueryParams) {
    const res = await api().feeds.get({
      url,
    })

    const nonce = Math.random().toString(36).slice(2, 15)

    const finalData = {
      ...res.data.feed,
      updatesPerWeek: res.data.analytics?.updatesPerWeek,
      subscriptionCount: res.data.analytics?.subscriptionCount,
      latestEntryPublishedAt: res.data.analytics?.latestEntryPublishedAt,
    } as FeedModel
    if (!finalData.id) {
      finalData["nonce"] = nonce
      finalData["id"] = nonce
    }
    feedActions.upsertMany([finalData])

    return {
      responseData: res.data,
      feed: finalData,
    }
  }

  async claimFeed(feedId: string) {
    const curFeed = get().feeds[feedId]
    if (!curFeed) return

    const tx = createTransaction()
    tx.store(() => {
      feedActions.patchInSession(feedId, {
        ownerUserId: whoami()?.id || null,
      })
    })

    tx.request(async () => {
      await api().feeds.claim.challenge({
        feedId,
      })
    })

    tx.persist(() => {
      const newFeed = get().feeds[feedId]
      if (!newFeed) return
      return FeedService.upsertMany([newFeed])
    })

    tx.rollback(() => {
      feedActions.patchInSession(feedId, {
        ownerUserId: curFeed.ownerUserId,
      })
    })

    await tx.run()
  }

  async fetchAnalytics(feedId: string | string[]) {
    const feedIds = Array.isArray(feedId) ? feedId : [feedId]
    const res = await api().feeds.analytics({
      id: feedIds,
    })

    const { analytics } = res.data

    for (const id of feedIds) {
      const feedAnalytics = analytics[id]
      if (feedAnalytics) {
        await feedActions.patch(id, {
          subscriptionCount: feedAnalytics.subscriptionCount,
          updatesPerWeek: feedAnalytics.updatesPerWeek,
          latestEntryPublishedAt: getDateISOString(feedAnalytics.latestEntryPublishedAt),
        })
      }
    }

    return analytics
  }
}
export const feedSyncServices = new FeedSyncServices()
export const feedActions = new FeedActions()
