import { FeedViewType } from "@suhui/constants"
import { EntryService } from "@suhui/database/services/entry"
import { SubscriptionService } from "@suhui/database/services/subscription"

import { dbStoreMorph } from "../morph/db-store"
import { buildSubscriptionDbId, storeDbMorph } from "../morph/store-db"
import type { EntryModel, FetchEntriesProps } from "../modules/entry/types"
import type { FeedModel } from "../modules/feed/types"
import type { SubscriptionForm, SubscriptionModel } from "../modules/subscription/types"
import { getRuntimeEnv } from "../remote/env"
import {
  transformEntryFromApi,
  transformSubscriptionFromApi,
  type EntryRecord,
  type SubscriptionRecord,
  type UnreadRecord,
} from "../remote/transforms"

type IpcRendererLike = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

type RuntimeFetchEntriesOptions = FetchEntriesProps & {
  localFallbackEntries?: EntryModel[]
}

type RuntimeSubscriptionListResult = {
  subscriptions: SubscriptionModel[]
  feeds: Array<Partial<FeedModel> & { id: string }>
}

type SubscriptionDeleteTargets = {
  ids?: string[]
  feedIds?: string[]
  listIds?: string[]
  inboxIds?: string[]
}

type RemoteSettings = {
  appearance: "light" | "dark" | "system"
  rsshubCustomUrl: string
}

const getIpc = (): IpcRendererLike | null => {
  if (typeof window === "undefined") return null
  return ((window as any).electron?.ipcRenderer as IpcRendererLike | undefined) ?? null
}

const jsonRequest = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<T>
}

const fetchRemoteEntries = async (props: FetchEntriesProps): Promise<EntryModel[]> => {
  const { feedId, feedIdList, read, limit, pageParam } = props
  const params = new URLSearchParams()

  if (feedId) {
    const feedIds = feedId.includes(",")
      ? feedId
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : [feedId]
    if (feedIds.length === 1 && feedIds[0]) {
      params.set("feedId", feedIds[0])
    }
  } else if (feedIdList?.length === 1 && feedIdList[0]) {
    params.set("feedId", feedIdList[0])
  }

  if (read === false) {
    params.set("unreadOnly", "1")
  }

  const { data } = await jsonRequest<{ data: EntryRecord[] }>(
    `/api/entries${params.toString() ? `?${params.toString()}` : ""}`,
  )
  let entries = data || []

  if (feedId && feedId.includes(",")) {
    const feedIdSet = new Set(
      feedId
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
    entries = entries.filter((entry) => entry.feedId && feedIdSet.has(entry.feedId))
  } else if (feedIdList && feedIdList.length > 1) {
    const feedIdSet = new Set(feedIdList)
    entries = entries.filter((entry) => entry.feedId && feedIdSet.has(entry.feedId))
  }

  entries.sort((a, b) => {
    const publishedCompare = (b.publishedAt ?? 0) - (a.publishedAt ?? 0)
    if (publishedCompare !== 0) return publishedCompare
    return (b.insertedAt ?? 0) - (a.insertedAt ?? 0)
  })

  if (pageParam) {
    const cursorTime = new Date(pageParam).getTime()
    entries = entries.filter((entry) => (entry.publishedAt ?? 0) < cursorTime)
  }

  return entries.slice(0, limit ?? 20).map(transformEntryFromApi)
}

const fetchDesktopEntries = async (props: FetchEntriesProps): Promise<EntryModel[]> => {
  const ipc = getIpc()
  if (!ipc) return []

  const { feedId, feedIdList, read, pageParam, limit } = props
  let entries: any[] = []

  if (feedId) {
    const feedIds = Array.from(
      new Set(
        (feedId.includes(",") ? feedId.split(",") : [feedId])
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    )
    const results = await Promise.all(feedIds.map((id) => ipc.invoke("db.getEntries", id)))
    entries = results.flat() as any[]
  } else if (feedIdList && feedIdList.length > 0) {
    const results = await Promise.all(
      Array.from(new Set(feedIdList)).map((id) => ipc.invoke("db.getEntries", id)),
    )
    entries = results.flat() as any[]
  } else {
    entries = (await ipc.invoke("db.getEntries")) as any[]
  }

  if (typeof read === "boolean") {
    entries = entries.filter((entry) => {
      const rawRead = entry?.read
      const normalizedRead =
        typeof rawRead === "boolean" ? rawRead : rawRead === 1 || rawRead === "1"
      return normalizedRead === read
    })
  }

  const entryById = new Map<string, any>()
  for (const entry of entries) {
    if (typeof entry?.id === "string" && !entryById.has(entry.id)) {
      entryById.set(entry.id, entry)
    }
  }
  entries = Array.from(entryById.values())

  entries.sort((a, b) => {
    const dateA =
      a.publishedAt instanceof Date
        ? a.publishedAt.getTime()
        : new Date(a.publishedAt ?? 0).getTime()
    const dateB =
      b.publishedAt instanceof Date
        ? b.publishedAt.getTime()
        : new Date(b.publishedAt ?? 0).getTime()
    return dateB - dateA
  })

  if (pageParam) {
    const cursorTime = new Date(pageParam).getTime()
    entries = entries.filter((entry) => {
      const time =
        entry.publishedAt instanceof Date
          ? entry.publishedAt.getTime()
          : new Date(entry.publishedAt ?? 0).getTime()
      return time < cursorTime
    })
  }

  return entries.slice(0, limit ?? 20).map((entry) => dbStoreMorph.toEntryModel(entry))
}

const filterLocalEntries = (props: RuntimeFetchEntriesOptions): EntryModel[] => {
  const { feedId, feedIdList, read, pageParam, limit } = props
  let entries = props.localFallbackEntries ?? []

  if (feedId) {
    const feedIds = new Set(feedId.split(","))
    entries = entries.filter((entry) => entry.feedId && feedIds.has(entry.feedId))
  } else if (feedIdList && feedIdList.length > 0) {
    const feedSet = new Set(feedIdList)
    entries = entries.filter((entry) => entry.feedId && feedSet.has(entry.feedId))
  }

  if (typeof read === "boolean") {
    entries = entries.filter((entry) => entry.read === read)
  }

  entries = Array.from(new Map(entries.map((entry) => [entry.id, entry])).values())
  entries.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))

  if (pageParam) {
    const cursorTime = new Date(pageParam).getTime()
    entries = entries.filter((entry) => (entry.publishedAt ?? 0) < cursorTime)
  }

  return entries.slice(0, limit ?? 20)
}

const parseFeedViaProxy = async (subscription: SubscriptionForm) => {
  const feedUrl = subscription.url || ""
  const response = await fetch(`/api/rss-proxy?url=${encodeURIComponent(feedUrl)}`)
  if (!response.ok) throw new Error(`Failed to fetch feed: ${response.status}`)

  const xml = new DOMParser().parseFromString(await response.text(), "text/xml")
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
  const feedId =
    subscription.feedId || `local_feed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  return {
    feed: {
      type: "feed" as const,
      id: feedId,
      title: subscription.title || feedTitle,
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
    },
    subscription: {
      id: `feed/${feedId}`,
      feedId,
      userId: "local_user_id",
      view: subscription.view,
      isPrivate: false,
      hideFromTimeline: subscription.hideFromTimeline ?? false,
      title: subscription.title || feedTitle || null,
      category: subscription.category || null,
      type: "feed" as const,
      listId: null,
      inboxId: null,
      createdAt: new Date().toISOString(),
    },
    entries: [],
  }
}

export const runtimeClient = {
  entries: {
    async list(props: RuntimeFetchEntriesOptions): Promise<EntryModel[]> {
      if (getRuntimeEnv().isRemote) return fetchRemoteEntries(props)
      if (getIpc()) return fetchDesktopEntries(props)
      return filterLocalEntries(props)
    },

    async getDetail(entryId: string): Promise<EntryModel | null> {
      if (getRuntimeEnv().isRemote) {
        const response = await fetch(`/api/entries/${encodeURIComponent(entryId)}`)
        if (!response.ok) {
          if (response.status === 404) return null
          throw new Error(`HTTP ${response.status}`)
        }
        const { data } = (await response.json()) as { data: EntryRecord | null }
        return data ? transformEntryFromApi(data) : null
      }

      const ipc = getIpc()
      if (ipc) {
        const entry = await ipc.invoke("db.getEntry", entryId)
        return entry ? dbStoreMorph.toEntryModel(entry as any) : null
      }

      return null
    },

    async updateReadStatus(payload: { entryIds: string[]; read: boolean }) {
      if (getRuntimeEnv().isRemote) {
        await jsonRequest("/api/entries/read", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        return
      }

      const ipc = getIpc()
      if (ipc) {
        await ipc.invoke("db.updateReadStatus", payload)
        return
      }

      await EntryService.patchMany({
        entry: { read: payload.read },
        entryIds: payload.entryIds,
      })
    },
  },

  subscriptions: {
    async list(
      view: number | undefined,
      local: RuntimeSubscriptionListResult,
    ): Promise<RuntimeSubscriptionListResult> {
      const ipc = getIpc()
      if (!getRuntimeEnv().isRemote && ipc) {
        const [rawSubscriptions, rawFeeds] = await Promise.all([
          ipc.invoke("db.getSubscriptions"),
          ipc.invoke("db.getFeeds"),
        ])
        const subscriptions = ((rawSubscriptions as any[]) || []).map((subscription) =>
          dbStoreMorph.toSubscriptionModel(subscription),
        )
        const filtered =
          view !== undefined
            ? subscriptions.filter((subscription) => subscription.view === view)
            : subscriptions
        const feedIds = new Set(filtered.map((subscription) => subscription.feedId).filter(Boolean))
        return {
          subscriptions: filtered,
          feeds: ((rawFeeds as Array<Partial<FeedModel> & { id: string }>) || []).filter((feed) =>
            feedIds.has(feed.id),
          ),
        }
      }

      if (!getRuntimeEnv().isRemote) {
        const subscriptions =
          view !== undefined
            ? local.subscriptions.filter((subscription) => subscription.view === view)
            : local.subscriptions
        const feedIds = new Set(
          subscriptions.map((subscription) => subscription.feedId).filter(Boolean),
        )
        return {
          subscriptions,
          feeds: local.feeds.filter((feed) => feedIds.has(feed.id)),
        }
      }

      const { data } = await jsonRequest<{ data: SubscriptionRecord[] }>("/api/subscriptions")
      const subscriptions = (data || []).map(transformSubscriptionFromApi)
      const filtered =
        view !== undefined
          ? subscriptions.filter((subscription) => subscription.view === view)
          : subscriptions
      const feeds = Array.from(
        new Set(filtered.map((subscription) => subscription.feedId).filter(Boolean)),
      ).map((id) => ({
        id: id!,
        title: filtered.find((subscription) => subscription.feedId === id)?.title || null,
        url: "",
      }))
      return { subscriptions: filtered, feeds }
    },

    async create(subscription: SubscriptionForm): Promise<any> {
      if (getRuntimeEnv().isRemote) {
        const { data } = await jsonRequest<{ data: unknown }>("/api/subscriptions", {
          method: "POST",
          body: JSON.stringify(subscription),
        })
        return data
      }

      const ipc = getIpc()
      if (ipc) return ipc.invoke("db.addFeed", subscription)
      return parseFeedViaProxy(subscription)
    },

    async update(subscription: SubscriptionModel) {
      if (!getRuntimeEnv().isRemote && !getIpc()) {
        await SubscriptionService.patch(storeDbMorph.toSubscriptionSchema(subscription))
        return
      }

      const subscriptionId = buildSubscriptionDbId(subscription)
      const payload = {
        title: subscription.title ?? null,
        category: subscription.category ?? null,
        view: subscription.view,
      }

      return this.updateById(subscriptionId, payload)
    },

    async updateById(
      subscriptionId: string,
      payload: { title?: string | null; category?: string | null; view?: number },
    ) {
      if (getRuntimeEnv().isRemote) {
        await jsonRequest(`/api/subscriptions/${encodeURIComponent(subscriptionId)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        return
      }

      const ipc = getIpc()
      if (ipc) {
        await ipc.invoke("db.updateSubscription", subscriptionId, payload)
        return
      }

      throw new Error("Cannot update subscription without a full subscription model")
    },

    async deleteByTargets(payload: SubscriptionDeleteTargets) {
      if (getRuntimeEnv().isRemote) {
        await jsonRequest("/api/subscriptions", {
          method: "DELETE",
          body: JSON.stringify(payload),
        })
        return
      }

      const ipc = getIpc()
      if (ipc) {
        await ipc.invoke("db.deleteSubscriptionByTargets", payload)
        return
      }

      await SubscriptionService.deleteByTargets(payload)
    },

    async batchUpdate(payload: { feedIds: string[]; category?: string | null; view?: number }) {
      if (getRuntimeEnv().isRemote) {
        await jsonRequest("/api/subscriptions", {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        return
      }

      const ipc = getIpc()
      if (ipc) {
        await ipc.invoke("db.batchUpdateSubscriptions", payload)
        return
      }

      await SubscriptionService.patchMany({
        feedIds: payload.feedIds,
        data: {
          ...(payload.view !== undefined ? { view: payload.view } : {}),
          ...(payload.category !== undefined ? { category: payload.category } : {}),
        },
      })
    },
  },

  feeds: {
    async preview(input: {
      url: string
      feedId?: string
      allowPublicRsshub?: boolean
    }): Promise<any> {
      if (getRuntimeEnv().isRemote) {
        const { data } = await jsonRequest<{ data: any }>("/api/feeds/preview", {
          method: "POST",
          body: JSON.stringify(input),
        })
        return data
      }

      const ipc = getIpc()
      if (ipc) return ipc.invoke("db.previewFeed", input)
      return parseFeedViaProxy({
        url: input.url,
        feedId: input.feedId ?? null,
        view: FeedViewType.Articles,
        category: null,
        hideFromTimeline: false,
        isPrivate: false,
        listId: undefined,
        title: null,
      })
    },

    async refresh(feedId?: string) {
      if (getRuntimeEnv().isRemote) {
        return feedId
          ? jsonRequest(`/api/feeds/${encodeURIComponent(feedId)}/refresh`, { method: "POST" })
          : jsonRequest("/api/feeds/refresh-all", { method: "POST" })
      }

      const ipc = getIpc()
      if (!ipc) return
      return feedId
        ? ipc.invoke("db.refreshFeed", feedId)
        : ipc.invoke("db.refreshLocalSubscribedFeeds")
    },
  },

  unread: {
    async list(): Promise<UnreadRecord[]> {
      const { data } = await jsonRequest<{ data: UnreadRecord[] }>("/api/unread")
      return data || []
    },
  },

  settings: {
    async get(): Promise<RemoteSettings> {
      const { data } = await jsonRequest<{ data: RemoteSettings }>("/api/settings")
      return data
    },

    async update(payload: Partial<RemoteSettings>): Promise<RemoteSettings> {
      const { data } = await jsonRequest<{ data: RemoteSettings }>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
      return data
    },
  },

  rsshub: {
    async precheck(payload: { url: string; allowPublicFallback?: boolean }) {
      return jsonRequest("/api/rsshub/precheck", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    },
  },

  importExport: {
    async exportData() {
      const { data } = await jsonRequest<{ data: unknown }>("/api/export")
      return data
    },

    async importData(payload: unknown) {
      const { data } = await jsonRequest<{ data: unknown }>("/api/import", {
        method: "POST",
        body: typeof payload === "string" ? payload : JSON.stringify(payload),
      })
      return data
    },
  },

  pdf: {
    async exportEntry(entryId: string): Promise<Blob> {
      const response = await fetch(`/api/entries/${encodeURIComponent(entryId)}/pdf`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.blob()
    },
  },

  events: {
    connect(): EventSource {
      return new EventSource("/events")
    },
  },
}
