import { FeedViewType } from "@suhui/constants"
import { EntryService } from "@suhui/database/services/entry"
import { cloneDeep } from "es-toolkit"
import { debounce } from "es-toolkit/compat"

import { api } from "../../context"
import { getRuntimeEnv } from "../../remote/env"
import { transformEntryFromApi, type EntryRecord } from "../../remote/transforms"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction } from "../../lib/helper"
import { dbStoreMorph } from "../../morph/db-store"
import { storeDbMorph } from "../../morph/store-db"
import { getSubscriptionById } from "../subscription/getter"
import { getDefaultCategory } from "../subscription/utils"
import type {
  FeedIdOrInboxHandle,
  InsertedBeforeTimeRangeFilter,
  PublishAtTimeRangeFilter,
} from "../unread/types"
import type { EntryState } from "./base"
import { defaultState, useEntryStore } from "./base"
import { getEntry } from "./getter"
import type { EntryModel, FetchEntriesProps, FetchEntriesPropsSettings } from "./types"

type EntryId = string
type FeedId = string
type InboxId = string
type Category = string
type ListId = string
export { useEntryStore } from "./base"

const get = useEntryStore.getState
const immerSet = createImmerSetter(useEntryStore)

class EntryActions implements Hydratable, Resetable {
  async hydrate() {
    const entries = await EntryService.getEntriesToHydrate()
    entryActions.upsertManyInSession(entries.map((e) => dbStoreMorph.toEntryModel(e)))
  }

  getFlattenMapEntries() {
    const state = get()
    return state.data
  }

  private dedupeEntriesById(entries: EntryModel[]) {
    if (entries.length <= 1) return entries
    const map = new Map<string, EntryModel>()
    for (const entry of entries) {
      if (!entry?.id) continue
      map.set(entry.id, entry)
    }
    return Array.from(map.values())
  }

  private dedupeSources(sources?: string[] | null) {
    if (!sources || sources.length <= 1) return sources ?? []
    return Array.from(new Set(sources.filter((s): s is string => typeof s === "string" && !!s)))
  }

  private addEntryIdToView({
    draft,
    feedId,
    entryId,
    sources,
    hidePrivateSubscriptionsInTimeline,
  }: {
    draft: EntryState
    feedId?: FeedId | null
    entryId: EntryId
    sources?: string[] | null
    hidePrivateSubscriptionsInTimeline?: boolean
  }) {
    if (!feedId) return

    const subscription = getSubscriptionById(feedId)
    if (!subscription) return
    const ignore =
      (hidePrivateSubscriptionsInTimeline && subscription?.isPrivate) ||
      subscription?.hideFromTimeline

    if (!ignore) {
      if (typeof subscription?.view === "number") {
        draft.entryIdByView[subscription.view as FeedViewType].add(entryId)
      }
      draft.entryIdByView[FeedViewType.All].add(entryId)
    }

    // lists
    for (const s of sources ?? []) {
      const subscription = getSubscriptionById(s)
      if (!subscription) continue
      const ignore =
        (hidePrivateSubscriptionsInTimeline && subscription?.isPrivate) ||
        subscription?.hideFromTimeline

      if (!ignore) {
        if (typeof subscription?.view === "number") {
          draft.entryIdByView[subscription.view as FeedViewType].add(entryId)
        }
        draft.entryIdByView[FeedViewType.All].add(entryId)
      }
    }
  }

  private addEntryIdToCategory({
    draft,
    feedId,
    entryId,
  }: {
    draft: EntryState
    feedId?: FeedId | null
    entryId: EntryId
  }) {
    if (!feedId) return
    const subscription = getSubscriptionById(feedId)
    const category = subscription?.category || getDefaultCategory(subscription)
    if (!category) return
    const entryIdSetByCategory = draft.entryIdByCategory[category]
    if (!entryIdSetByCategory) {
      draft.entryIdByCategory[category] = new Set([entryId])
    } else {
      entryIdSetByCategory.add(entryId)
    }
  }

  private addEntryIdToFeed({
    draft,
    feedId,
    entryId,
  }: {
    draft: EntryState
    feedId?: FeedId | null
    entryId: EntryId
  }) {
    if (!feedId) return
    const entryIdSetByFeed = draft.entryIdByFeed[feedId]
    if (!entryIdSetByFeed) {
      draft.entryIdByFeed[feedId] = new Set([entryId])
    } else {
      entryIdSetByFeed.add(entryId)
    }
  }

  private addEntryIdToInbox({
    draft,
    inboxHandle,
    entryId,
  }: {
    draft: EntryState
    inboxHandle?: InboxId | null
    entryId: EntryId
  }) {
    if (!inboxHandle) return
    const entryIdSetByInbox = draft.entryIdByInbox[inboxHandle]
    if (!entryIdSetByInbox) {
      draft.entryIdByInbox[inboxHandle] = new Set([entryId])
    } else {
      entryIdSetByInbox.add(entryId)
    }
  }

  private addEntryIdToList({
    draft,
    listId,
    entryId,
  }: {
    draft: EntryState
    listId?: ListId | null
    entryId: EntryId
  }) {
    if (!listId) return
    const entryIdSetByList = draft.entryIdByList[listId]
    if (!entryIdSetByList) {
      draft.entryIdByList[listId] = new Set([entryId])
    } else {
      entryIdSetByList.add(entryId)
    }
  }

  upsertManyInSession(entries: EntryModel[], options?: FetchEntriesPropsSettings) {
    if (entries.length === 0) return
    const { unreadOnly, hidePrivateSubscriptionsInTimeline } = options || {}
    const dedupedEntries = this.dedupeEntriesById(entries)

    immerSet((draft) => {
      for (const entry of dedupedEntries) {
        draft.entryIdSet.add(entry.id)
        draft.data[entry.id] = entry

        const { feedId, inboxHandle, read, sources } = entry
        if (unreadOnly && read) continue

        if (inboxHandle) {
          this.addEntryIdToInbox({
            draft,
            inboxHandle,
            entryId: entry.id,
          })
        } else {
          this.addEntryIdToFeed({
            draft,
            feedId,
            entryId: entry.id,
          })
        }

        this.addEntryIdToView({
          draft,
          feedId,
          entryId: entry.id,
          sources,
          hidePrivateSubscriptionsInTimeline,
        })

        this.addEntryIdToCategory({
          draft,
          feedId,
          entryId: entry.id,
        })

        this.dedupeSources(entry.sources)
          ?.filter((s) => !!s && s !== "feed")
          .forEach((s) => {
            this.addEntryIdToList({
              draft,
              listId: s,
              entryId: entry.id,
            })
          })
      }
    })
  }

  rebuildIndexesInSession() {
    immerSet((draft) => {
      draft.entryIdByView = {
        [FeedViewType.All]: new Set(),
        [FeedViewType.Articles]: new Set(),
        [FeedViewType.Audios]: new Set(),
        [FeedViewType.Notifications]: new Set(),
        [FeedViewType.Pictures]: new Set(),
        [FeedViewType.SocialMedia]: new Set(),
        [FeedViewType.Videos]: new Set(),
      }
      draft.entryIdByFeed = {}
      draft.entryIdByInbox = {}
      draft.entryIdByCategory = {}
      draft.entryIdByList = {}
      draft.entryIdSet = new Set(Object.keys(draft.data))

      for (const entry of Object.values(draft.data)) {
        if (!entry?.id) continue

        const { feedId, inboxHandle } = entry
        if (inboxHandle) {
          this.addEntryIdToInbox({
            draft,
            inboxHandle,
            entryId: entry.id,
          })
        } else {
          this.addEntryIdToFeed({
            draft,
            feedId,
            entryId: entry.id,
          })
        }

        this.addEntryIdToView({
          draft,
          feedId,
          entryId: entry.id,
          sources: entry.sources,
        })

        this.addEntryIdToCategory({
          draft,
          feedId,
          entryId: entry.id,
        })

        this.dedupeSources(entry.sources)
          ?.filter((s) => !!s && s !== "feed")
          .forEach((s) => {
            this.addEntryIdToList({
              draft,
              listId: s,
              entryId: entry.id,
            })
          })
      }
    })
  }

  async upsertMany(entries: EntryModel[]) {
    const tx = createTransaction()
    tx.store(() => {
      this.upsertManyInSession(entries)
    })

    tx.persist(() => {
      return EntryService.upsertMany(entries.map((e) => storeDbMorph.toEntrySchema(e)))
    })

    await tx.run()
  }

  updateEntryContentInSession({
    entryId,
    content,
    readabilityContent,
    readabilityUpdatedAt,
  }: {
    entryId: EntryId
    content?: string
    readabilityContent?: string
    readabilityUpdatedAt?: number
  }) {
    immerSet((draft) => {
      const entry = draft.data[entryId]
      if (!entry) return
      if (content) {
        entry.content = content
      }
      if (readabilityContent) {
        entry.readabilityContent = readabilityContent
        entry.readabilityUpdatedAt = readabilityUpdatedAt ?? entry.readabilityUpdatedAt ?? null
      }
    })
  }

  async updateEntryContent({
    entryId,
    content,
    readabilityContent,
    readabilityUpdatedAt = Date.now(),
  }: {
    entryId: EntryId
    content?: string
    readabilityContent?: string
    readabilityUpdatedAt?: number
  }) {
    const tx = createTransaction()
    tx.store(() => {
      this.updateEntryContentInSession({
        entryId,
        content,
        readabilityContent,
        readabilityUpdatedAt,
      })
    })

    tx.persist(() => {
      if (content) {
        EntryService.patch({ id: entryId, content })
      }

      if (readabilityContent) {
        EntryService.patch({ id: entryId, readabilityContent, readabilityUpdatedAt })
      }
    })

    await tx.run()
  }

  markEntryReadStatusInSession({
    entryIds,
    ids,
    read,
    time,
  }: {
    entryIds?: EntryId[]
    ids?: FeedIdOrInboxHandle[]
    read: boolean
    time?: PublishAtTimeRangeFilter | InsertedBeforeTimeRangeFilter
  }) {
    const affectedEntryIds = new Set<EntryId>()

    immerSet((draft) => {
      if (entryIds) {
        for (const entryId of entryIds) {
          const entry = draft.data[entryId]
          if (!entry) {
            continue
          }

          if (
            time &&
            "startTime" in time &&
            (+new Date(entry.publishedAt) < time.startTime ||
              +new Date(entry.publishedAt) > time.endTime)
          ) {
            continue
          }
          if (
            time &&
            "insertedBefore" in time &&
            +new Date(entry.insertedAt) >= time.insertedBefore
          ) {
            continue
          }

          if (entry.read !== read) {
            entry.read = read
            affectedEntryIds.add(entryId)
          }
        }
      }

      if (ids) {
        const entries = Array.from(draft.entryIdSet)
          .map((id) => draft.data[id])
          .filter((entry): entry is EntryModel => {
            if (!entry) return false
            const id = entry.inboxHandle || entry.feedId || ""
            if (!id) return false
            return ids.includes(id)
          })

        for (const entry of entries) {
          if (
            time &&
            "startTime" in time &&
            (+new Date(entry.publishedAt) < time.startTime ||
              +new Date(entry.publishedAt) > time.endTime)
          ) {
            continue
          }
          if (
            time &&
            "insertedBefore" in time &&
            +new Date(entry.insertedAt) >= time.insertedBefore
          ) {
            continue
          }

          if (entry.read !== read) {
            entry.read = read
            affectedEntryIds.add(entry.id)
          }
        }
      }
    })

    return Array.from(affectedEntryIds)
  }

  resetByView({ view, entries }: { view?: FeedViewType; entries: EntryModel[] }) {
    if (view === undefined) return
    immerSet((draft) => {
      draft.entryIdByView[view] = new Set(entries.map((e) => e.id))
    })
  }

  resetByCategory({ category, entries }: { category?: Category; entries: EntryModel[] }) {
    if (!category) return
    immerSet((draft) => {
      draft.entryIdByCategory[category] = new Set(entries.map((e) => e.id))
    })
  }

  resetByFeed({ feedId, entries }: { feedId?: FeedId; entries: EntryModel[] }) {
    if (!feedId) return
    immerSet((draft) => {
      draft.entryIdByFeed[feedId] = new Set(entries.map((e) => e.id))
    })
  }

  resetByInbox({ inboxId, entries }: { inboxId?: InboxId; entries: EntryModel[] }) {
    if (!inboxId) return
    immerSet((draft) => {
      draft.entryIdByInbox[inboxId] = new Set(entries.map((e) => e.id))
    })
  }

  resetByList({ listId, entries }: { listId?: ListId; entries: EntryModel[] }) {
    if (!listId) return
    immerSet((draft) => {
      draft.entryIdByList[listId] = new Set(entries.map((e) => e.id))
    })
  }

  deleteInboxEntryById(entryId: EntryId) {
    const entry = get().data[entryId]
    if (!entry || !entry.inboxHandle) return

    immerSet((draft) => {
      delete draft.data[entryId]
      draft.entryIdSet.delete(entryId)
      draft.entryIdByInbox[entry.inboxHandle!]?.delete(entryId)
      draft.entryIdByView[FeedViewType.All].delete(entryId)
    })
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      immerSet(() => defaultState)
    })

    tx.persist(() => {
      return EntryService.reset()
    })

    await tx.run()
  }
}

class EntrySyncServices {
  async fetchEntries(props: FetchEntriesProps) {
    const { isRemote } = getRuntimeEnv()

    // [Remote Mode] Fetch entries from HTTP API
    if (isRemote) {
      return this.fetchEntriesFromRemote(props)
    }

    // [Local Mode] Query entries from the local SQLite DB via IPC, then cache in store
    const { feedId, feedIdList, read } = props

    let entries: any[] = []

    if (typeof window !== "undefined" && (window as any).electron?.ipcRenderer) {
      const ipc = (window as any).electron.ipcRenderer
      if (feedId) {
        // feedId may be comma-separated (folder view)
        const feedIds = Array.from(
          new Set(
            (feedId.includes(",") ? feedId.split(",") : [feedId])
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        )
        const results = await Promise.all(
          feedIds.map((id: string) => ipc.invoke("db.getEntries", id)),
        )
        entries = results.flat()
      } else if (feedIdList && feedIdList.length > 0) {
        const uniqueFeedIds = Array.from(new Set(feedIdList))
        const results = await Promise.all(
          uniqueFeedIds.map((id: string) => ipc.invoke("db.getEntries", id)),
        )
        entries = results.flat()
      } else {
        // All entries (e.g., "All" view)
        entries = await ipc.invoke("db.getEntries")
      }
    } else {
      // Web fallback: read from in-memory store
      const allEntries = Object.values(get().data) as any[]
      if (feedId) {
        const feedIds = new Set(feedId.split(","))
        entries = allEntries.filter((e) => feedIds.has(e.feedId))
      } else if (feedIdList && feedIdList.length > 0) {
        const feedSet = new Set(feedIdList)
        entries = allEntries.filter((e) => feedSet.has(e.feedId))
      } else {
        entries = allEntries
      }
    }

    // Apply read/unread filter when explicitly requested (e.g. unreadOnly -> read=false).
    if (typeof read === "boolean") {
      entries = entries.filter((entry) => {
        const rawRead = entry?.read
        const normalizedRead =
          typeof rawRead === "boolean" ? rawRead : rawRead === 1 || rawRead === "1"
        return normalizedRead === read
      })
    }

    // Guard against duplicate records when the same feed is requested multiple times.
    const entryById = new Map<string, any>()
    for (const entry of entries) {
      const entryId = typeof entry?.id === "string" ? entry.id : undefined
      if (!entryId) continue
      if (!entryById.has(entryId)) {
        entryById.set(entryId, entry)
      }
    }
    entries = Array.from(entryById.values())

    // Sort by publishedAt descending (raw rows may have Date or ISO string)
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

    // Apply cursor-based pagination: skip entries on or after the cursor date
    // pageParam is the publishedAt ISO string of the LAST entry on the previous page
    const { pageParam, limit } = props as any
    if (pageParam) {
      const cursorTime = new Date(pageParam).getTime()
      entries = entries.filter((e) => {
        const t =
          e.publishedAt instanceof Date
            ? e.publishedAt.getTime()
            : new Date(e.publishedAt ?? 0).getTime()
        return t < cursorTime
      })
    }

    // Apply page size limit (default 20)
    const pageSize = limit ?? 20
    entries = entries.slice(0, pageSize)

    // CRITICAL FIX: Convert raw DB rows to EntryModel before upserting into Zustand store
    const entryModels = entries.map((e: any) => dbStoreMorph.toEntryModel(e))

    // Load into Zustand store for detail-view lookups
    if (entryModels.length > 0) {
      try {
        entryActions.upsertManyInSession(entryModels)
      } catch (err) {
        console.error("[Antigravity] upsertManyInSession error", err)
      }
    }

    console.info(
      "[Antigravity] fetchEntries returning page:",
      entryModels.length,
      "cursor:",
      pageParam ?? "initial",
    )

    return {
      data: entryModels.map((e: any) => ({ entries: e, feeds: { id: e.feedId, type: "feed" } })),
    } as any
  }

  /**
   * [Remote Mode] Fetch entries from HTTP API
   */
  private async fetchEntriesFromRemote(props: FetchEntriesProps) {
    const { feedId, feedIdList, read, limit, pageParam } = props

    const params = new URLSearchParams()

    // Handle feedId (may be comma-separated for folder view)
    if (feedId) {
      // For folder view, we fetch all feeds and filter client-side
      // API only supports single feedId, so we use the first one or fetch all
      const feedIds = feedId.includes(",")
        ? feedId
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : [feedId]

      if (feedIds.length === 1 && feedIds[0]) {
        params.set("feedId", feedIds[0])
      }
      // For multiple feedIds, we'll handle client-side filtering below
    } else if (feedIdList && feedIdList.length > 0) {
      if (feedIdList.length === 1 && feedIdList[0]) {
        params.set("feedId", feedIdList[0])
      }
    }

    // Handle read/unread filter
    if (read === false) {
      params.set("unreadOnly", "1")
    }

    const url = `/api/entries${params.toString() ? `?${params.toString()}` : ""}`

    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const { data } = (await response.json()) as { data: EntryRecord[] }
      let entries = data || []

      // Client-side filtering for multiple feedIds (folder view)
      if (feedId && feedId.includes(",")) {
        const feedIdSet = new Set(
          feedId
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        )
        entries = entries.filter((e) => e.feedId && feedIdSet.has(e.feedId))
      } else if (feedIdList && feedIdList.length > 1) {
        const feedIdSet = new Set(feedIdList)
        entries = entries.filter((e) => e.feedId && feedIdSet.has(e.feedId))
      }

      // Sort by publishedAt descending
      entries.sort((a, b) => {
        const dateA = a.publishedAt ?? 0
        const dateB = b.publishedAt ?? 0
        return dateB - dateA
      })

      // Apply cursor-based pagination
      if (pageParam) {
        const cursorTime = new Date(pageParam).getTime()
        entries = entries.filter((e) => {
          const t = e.publishedAt ?? 0
          return t < cursorTime
        })
      }

      // Apply page size limit (default 20)
      const pageSize = limit ?? 20
      entries = entries.slice(0, pageSize)

      // Convert to EntryModel
      const entryModels = entries.map(transformEntryFromApi)

      // Load into Zustand store
      if (entryModels.length > 0) {
        entryActions.upsertManyInSession(entryModels)
      }

      console.info(
        "[Remote] fetchEntriesFromRemote returning page:",
        entryModels.length,
        "cursor:",
        pageParam ?? "initial",
      )

      return {
        data: entryModels.map((e) => ({ entries: e, feeds: { id: e.feedId, type: "feed" } })),
      } as any
    } catch (error) {
      console.error("[Remote] fetchEntriesFromRemote error:", error)
      throw error
    }
  }

  async fetchEntryDetail(entryId: EntryId | undefined, _isInbox?: boolean) {
    if (!entryId) return null

    // First check in-memory store (populated by fetchEntries)
    const cached = getEntry(entryId)
    if (cached) return cached

    const { isRemote } = getRuntimeEnv()

    // [Remote Mode] Fetch from HTTP API
    if (isRemote) {
      try {
        const response = await fetch(`/api/entries/${encodeURIComponent(entryId)}`)
        if (!response.ok) {
          if (response.status === 404) return null
          throw new Error(`HTTP ${response.status}`)
        }
        const { data } = (await response.json()) as { data: EntryRecord | null }
        if (data) {
          const entryModel = transformEntryFromApi(data)
          entryActions.upsertManyInSession([entryModel])
          return entryModel
        }
        return null
      } catch (error) {
        console.error("[Remote] fetchEntryDetail error:", error)
        return null
      }
    }

    // Fallback: query DB directly via IPC
    if (typeof window !== "undefined" && (window as any).electron?.ipcRenderer) {
      const ipc = (window as any).electron.ipcRenderer
      const entry = await ipc.invoke("db.getEntry", entryId)
      if (entry) {
        entryActions.upsertManyInSession([entry])
        return entry
      }
    }

    return null
  }

  async fetchEntryReadabilityContent(
    entryId: EntryId,
    fallBack?: () => Promise<string | null | undefined>,
  ) {
    const entry = getEntry(entryId)
    if (!entry?.url) return entry
    if (
      entry.readabilityContent &&
      entry.readabilityUpdatedAt &&
      new Date(entry.readabilityUpdatedAt).getTime() > Date.now() - 1000 * 60 * 60 * 24 * 3
    ) {
      return entry
    }

    let readabilityContent: string | null | undefined

    try {
      const { data: contentByFetch } = await api().entries.readability({
        id: entryId,
      })
      readabilityContent = contentByFetch?.content || null
    } catch (error) {
      if (fallBack) {
        readabilityContent = await fallBack()
      } else {
        throw error
      }
    }
    if (readabilityContent) {
      await entryActions.updateEntryContent({
        entryId,
        readabilityContent,
      })
    }
    return entry
  }

  async fetchEntryContentByStream(_remoteEntryIds?: string[]) {
    // [Local Mode] Entry contents are fully fetched from local storage.
    // No need to query remote stream API.
    return
  }

  async fetchEntryReadHistory(_entryId: EntryId, _size: number) {
    // [Local Mode] No remote read-history endpoint. Keep the UI stable with local empty history.
    return {
      entryReadHistories: {
        userIds: [],
      },
      total: 0,
      users: {},
    }
  }

  async deleteInboxEntry(entryId: string) {
    const entry = get().data[entryId]
    if (!entry || !entry.inboxHandle) return
    const tx = createTransaction()
    const currentEntry = cloneDeep(entry)

    tx.store(() => {
      entryActions.deleteInboxEntryById(entryId)
    })
    tx.request(async () => {
      await api().entries.inbox.delete({ entryId })
    })
    tx.rollback(() => {
      entryActions.upsertManyInSession([currentEntry])
    })
    tx.persist(() => {
      return EntryService.deleteMany([entryId])
    })
    await tx.run()
  }
}

export const entrySyncServices = new EntrySyncServices()
export const entryActions = new EntryActions()
export const debouncedFetchEntryContentByStream = debounce(
  entrySyncServices.fetchEntryContentByStream,
  1000,
)
