import { FeedViewType } from "@suhui/constants"
import { EntryService } from "@suhui/database/services/entry"
import { SubscriptionService } from "@suhui/database/services/subscription"
import type { EntryChangeResponse } from "@suhui/shared/entry-change"

import { dbStoreMorph } from "../morph/db-store"
import { buildSubscriptionDbId, storeDbMorph } from "../morph/store-db"
import { entryChangeInvalidationCoordinator } from "../modules/entry/change-invalidation"
import type {
  EntryModel,
  FetchEntriesProps,
  RuntimeEntryListQuery,
  RuntimeEntrySummaryPage,
} from "../modules/entry/types"
import type { FeedModel } from "../modules/feed/types"
import type { SubscriptionForm, SubscriptionModel } from "../modules/subscription/types"
import { getRuntimeEnv } from "../remote/env"
import {
  transformCollectionsFromApi,
  transformEntryFromApi,
  transformSubscriptionFromApi,
  type CollectionRecord,
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

const handleRemoteMutationResponse = <T extends object>(
  response: EntryChangeResponse<T>,
): EntryChangeResponse<T> => {
  void entryChangeInvalidationCoordinator.handle(response.changeSet, "response").catch(() => {
    console.error("[RuntimeClient] Remote mutation cache calibration failed", {
      batchId: response.batchId,
    })
  })
  return response
}

const normalizeIds = (ids: Array<string | undefined>) =>
  Array.from(
    new Set(
      ids
        .flatMap((id) => id?.split(",") ?? [])
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  )

export const toEntryListQuery = (props: FetchEntriesProps): RuntimeEntryListQuery => {
  const feedIds = normalizeIds([props.feedId, ...(props.feedIdList ?? [])]).sort()
  const view = props.view === FeedViewType.All ? undefined : props.view
  const scope: RuntimeEntryListQuery["scope"] = props.listId
    ? { kind: "list", listId: props.listId }
    : props.inboxId
      ? { kind: "inbox", inboxId: props.inboxId }
      : props.isCollection
        ? { kind: "collection", ...(view === undefined ? {} : { view }) }
        : feedIds.length > 0
          ? { kind: "feeds", feedIds }
          : {
              kind: "timeline",
              ...(view === undefined ? {} : { view }),
              ...(props.excludePrivate === undefined
                ? {}
                : { excludePrivate: props.excludePrivate }),
            }

  return {
    scope,
    ...(props.read === undefined ? {} : { read: props.read }),
    ...(props.limit === undefined ? {} : { limit: props.limit }),
    ...(props.pageParam === undefined ? {} : { cursor: props.pageParam }),
  }
}

const appendRemoteEntryQuery = (params: URLSearchParams, query: RuntimeEntryListQuery) => {
  switch (query.scope.kind) {
    case "timeline":
      if (query.scope.view !== undefined) params.set("view", String(query.scope.view))
      if (query.scope.excludePrivate !== undefined) {
        params.set("excludePrivate", String(query.scope.excludePrivate))
      }
      break
    case "feeds":
      query.scope.feedIds.forEach((feedId) => params.append("feedId", feedId))
      break
    case "list":
      params.set("listId", query.scope.listId)
      break
    case "inbox":
      params.set("inboxId", query.scope.inboxId)
      break
    case "collection":
      params.set("isCollection", "true")
      if (query.scope.view !== undefined) params.set("view", String(query.scope.view))
      break
  }
  if (query.read !== undefined) params.set("read", String(query.read))
  if (query.limit !== undefined) params.set("limit", String(query.limit))
  if (query.cursor !== undefined) params.set("cursor", query.cursor)
}

const fetchRemoteEntries = async (props: FetchEntriesProps): Promise<RuntimeEntrySummaryPage> => {
  const query = toEntryListQuery(props)
  const params = new URLSearchParams()
  appendRemoteEntryQuery(params, query)

  const response = await jsonRequest<{
    data: EntryRecord[]
    page: RuntimeEntrySummaryPage["page"]
  }>(`/api/entries${params.toString() ? `?${params.toString()}` : ""}`)
  return {
    data: (response.data ?? []).map(transformEntryFromApi),
    page: response.page,
  }
}

const fetchDesktopEntries = async (props: FetchEntriesProps): Promise<RuntimeEntrySummaryPage> => {
  const ipc = getIpc()
  if (!ipc)
    return { data: [], page: { limit: props.limit ?? 20, hasMore: false, nextCursor: null } }

  const result = (await ipc.invoke("db.listEntries", toEntryListQuery(props))) as {
    items: any[]
    page: RuntimeEntrySummaryPage["page"]
  }
  return {
    data: (result.items ?? []).map((entry) => dbStoreMorph.toEntryModel(entry)),
    page: result.page,
  }
}

const encodeMemoryCursor = (entry: EntryModel) =>
  `memory-v1:${encodeURIComponent(JSON.stringify([entry.publishedAt, entry.insertedAt, entry.id]))}`

const decodeMemoryCursor = (cursor: string | undefined) => {
  if (!cursor?.startsWith("memory-v1:")) return null
  try {
    const value = JSON.parse(decodeURIComponent(cursor.slice("memory-v1:".length)))
    if (!Array.isArray(value) || value.length !== 3) return null
    return { publishedAt: Number(value[0]), insertedAt: Number(value[1]), id: String(value[2]) }
  } catch {
    return null
  }
}

const compareEntries = (a: EntryModel, b: EntryModel) =>
  b.publishedAt - a.publishedAt || b.insertedAt - a.insertedAt || b.id.localeCompare(a.id)

const isAfterMemoryCursor = (
  entry: EntryModel,
  cursor: { publishedAt: number; insertedAt: number; id: string },
) =>
  entry.publishedAt < cursor.publishedAt ||
  (entry.publishedAt === cursor.publishedAt && entry.insertedAt < cursor.insertedAt) ||
  (entry.publishedAt === cursor.publishedAt &&
    entry.insertedAt === cursor.insertedAt &&
    entry.id < cursor.id)

const toRuntimeSummary = (entry: EntryModel): EntryModel =>
  ({
    id: entry.id,
    title: entry.title,
    url: entry.url,
    description: entry.description,
    guid: entry.guid,
    author: entry.author,
    authorUrl: entry.authorUrl,
    authorAvatar: entry.authorAvatar,
    insertedAt: entry.insertedAt,
    publishedAt: entry.publishedAt,
    media: entry.media,
    categories: entry.categories,
    attachments: entry.attachments,
    language: entry.language,
    feedId: entry.feedId,
    inboxHandle: entry.inboxHandle,
    read: entry.read ?? false,
    sources: entry.sources,
    recordKind: "summary",
  }) as EntryModel

const filterLocalEntries = (props: RuntimeFetchEntriesOptions): RuntimeEntrySummaryPage => {
  const query = toEntryListQuery(props)
  const scope = query.scope
  let entries = props.localFallbackEntries ?? []

  if (scope.kind === "feeds") {
    const feedSet = new Set(scope.feedIds)
    entries = entries.filter((entry) => !!entry.feedId && feedSet.has(entry.feedId))
  } else if (scope.kind === "inbox") {
    entries = entries.filter((entry) => entry.inboxHandle === scope.inboxId)
  } else if (scope.kind === "list") {
    entries = entries.filter((entry) => entry.sources?.includes(scope.listId))
  }

  if (typeof query.read === "boolean") {
    entries = entries.filter((entry) => !!entry.read === query.read)
  }

  entries = Array.from(new Map(entries.map((entry) => [entry.id, entry])).values())
  entries.sort(compareEntries)

  const cursor = decodeMemoryCursor(query.cursor)
  if (cursor) entries = entries.filter((entry) => isAfterMemoryCursor(entry, cursor))

  const limit = query.limit ?? 20
  const hasMore = entries.length > limit
  const data = entries.splice(0, limit).map(toRuntimeSummary)
  return {
    data,
    page: {
      limit,
      hasMore,
      nextCursor: hasMore && data.length > 0 ? encodeMemoryCursor(data[data.length - 1]!) : null,
    },
  }
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
    async list(props: RuntimeFetchEntriesOptions): Promise<RuntimeEntrySummaryPage> {
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
        const response = await jsonRequest<EntryChangeResponse<{ ok: boolean }>>(
          "/api/entries/read",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        )
        return handleRemoteMutationResponse(response)
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
        const response = await jsonRequest<EntryChangeResponse<{ data: unknown }>>(
          "/api/subscriptions",
          {
            method: "POST",
            body: JSON.stringify(subscription),
          },
        )
        return handleRemoteMutationResponse(response)
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
        const response = await jsonRequest<EntryChangeResponse<{ data?: unknown }>>(
          `/api/subscriptions/${encodeURIComponent(subscriptionId)}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        )
        return handleRemoteMutationResponse(response)
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
        const response = await jsonRequest<EntryChangeResponse<{ ok: boolean }>>(
          "/api/subscriptions",
          {
            method: "DELETE",
            body: JSON.stringify(payload),
          },
        )
        return handleRemoteMutationResponse(response)
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
        const response = await jsonRequest<EntryChangeResponse<{ ok: boolean }>>(
          "/api/subscriptions",
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        )
        return handleRemoteMutationResponse(response)
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
        const response = feedId
          ? await jsonRequest<EntryChangeResponse<{ data: unknown }>>(
              `/api/feeds/${encodeURIComponent(feedId)}/refresh`,
              { method: "POST" },
            )
          : await jsonRequest<EntryChangeResponse<{ data: unknown }>>("/api/feeds/refresh-all", {
              method: "POST",
            })
        return handleRemoteMutationResponse(response)
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

  collections: {
    async list() {
      const { data } = await jsonRequest<{ data: CollectionRecord[] }>("/api/collections")
      return transformCollectionsFromApi(data || [])
    },

    async updateEntryStar(payload: { entryId: string; starred: boolean; view: number }) {
      if (getRuntimeEnv().isRemote) {
        const response = await jsonRequest<EntryChangeResponse<{ ok: boolean }>>(
          "/api/entries/star",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        )
        return handleRemoteMutationResponse(response)
      }

      const { collectionSyncService } = await import("../modules/collection/store")
      if (payload.starred) {
        await collectionSyncService.starEntry({
          entryId: payload.entryId,
          view: payload.view,
          invalidate: true,
        })
      } else {
        await collectionSyncService.unstarEntry({
          entryId: payload.entryId,
          invalidate: true,
        })
      }
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
      const response = await jsonRequest<EntryChangeResponse<{ data: unknown }>>("/api/import", {
        method: "POST",
        body: typeof payload === "string" ? payload : JSON.stringify(payload),
      })
      return handleRemoteMutationResponse(response)
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
