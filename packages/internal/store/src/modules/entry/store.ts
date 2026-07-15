import { FeedViewType } from "@suhui/constants"
import { EntryService } from "@suhui/database/services/entry"
import { cloneDeep } from "es-toolkit"
import { debounce } from "es-toolkit/compat"

import { api } from "../../context"
import {
  markEntryReadHydrateDirty,
  reconcileHydratedEntry,
  runWithHydrateSource,
} from "../../hydrate-phases"
import { runtimeClient } from "../../runtime"
import type { Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction } from "../../lib/helper"
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

const summaryFields = [
  "id",
  "title",
  "url",
  "description",
  "guid",
  "author",
  "authorUrl",
  "authorAvatar",
  "insertedAt",
  "publishedAt",
  "media",
  "categories",
  "attachments",
  "language",
  "feedId",
  "inboxHandle",
  "read",
  "sources",
] as const satisfies ReadonlyArray<keyof EntryModel>

const startupSnapshotEntryLimit = 100

const get = useEntryStore.getState
const immerSet = createImmerSetter(useEntryStore)

class EntryActions implements Resetable {
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

  private upsertProjectionInSession(
    entries: EntryModel[],
    projection: "summary" | "detail",
    options?: FetchEntriesPropsSettings,
  ) {
    if (entries.length === 0) return
    const { unreadOnly, hidePrivateSubscriptionsInTimeline } = options || {}
    const dedupedEntries = this.dedupeEntriesById(entries)

    immerSet((draft) => {
      for (const entry of dedupedEntries) {
        draft.entryIdSet.add(entry.id)
        const current = draft.data[entry.id]
        if (projection === "summary") {
          const merged = current ? { ...current } : ({ id: entry.id } as EntryModel)
          for (const field of summaryFields) {
            if (field === "read" && current && draft.dirtyReadEntryIds.has(entry.id)) continue
            if (field in entry) {
              ;(merged as any)[field] = entry[field]
            }
          }
          merged.recordKind = current?.recordKind === "detail" ? "detail" : "summary"
          draft.data[entry.id] = merged
        } else {
          draft.data[entry.id] = {
            ...current,
            ...entry,
            ...(current && draft.dirtyReadEntryIds.has(entry.id) ? { read: current.read } : {}),
            recordKind: "detail",
          }
          draft.detailLoadedEntryIds.add(entry.id)
        }

        const mergedEntry = draft.data[entry.id]!
        const { feedId, inboxHandle, read, sources } = mergedEntry
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

  upsertSummaries(entries: EntryModel[], options?: FetchEntriesPropsSettings) {
    this.upsertProjectionInSession(entries, "summary", options)
  }

  upsertDetails(entries: EntryModel[], options?: FetchEntriesPropsSettings) {
    this.upsertProjectionInSession(entries, "detail", options)
  }

  isDetailLoaded(entryId: string) {
    return get().detailLoadedEntryIds.has(entryId)
  }

  markReadMutationSettled(entryIds: string[]) {
    if (entryIds.length === 0) return
    immerSet((draft) => {
      entryIds.forEach((entryId) => draft.dirtyReadEntryIds.delete(entryId))
    })
  }

  upsertManyInSession(entries: EntryModel[], options?: FetchEntriesPropsSettings) {
    const summaries = entries.filter((entry) => entry.recordKind === "summary")
    const details = entries.filter((entry) => entry.recordKind !== "summary")
    if (summaries.length > 0) this.upsertSummaries(summaries, options)
    if (details.length > 0) this.upsertDetails(details, options)
  }

  restoreStartupSummariesInSession(
    entries: EntryModel[],
    options?: { protectedEntryIds?: Iterable<string> },
  ) {
    const protectedEntryIds = new Set(options?.protectedEntryIds ?? [])
    const incoming = this.dedupeEntriesById(entries)
      .filter((entry) => entry.recordKind === "summary")
      .slice(0, startupSnapshotEntryLimit)
      .map((entry) => ({ ...entry, recordKind: "summary" as const }))
    const incomingIds = new Set(incoming.map(({ id }) => id))

    immerSet((draft) => {
      const priorSnapshotIds = draft.startupSnapshotEntryIds ?? new Set<string>()
      for (const entryId of priorSnapshotIds) {
        if (incomingIds.has(entryId)) continue

        const current = draft.data[entryId]
        if (!current) continue
        if (
          protectedEntryIds.has(entryId) ||
          current.recordKind === "detail" ||
          draft.detailLoadedEntryIds.has(entryId) ||
          draft.dirtyReadEntryIds.has(entryId)
        ) {
          continue
        }

        delete draft.data[entryId]
      }

      draft.startupSnapshotEntryIds = incomingIds
    })

    this.upsertSummaries(
      incoming.map((entry) => reconcileHydratedEntry(entry, get().data[entry.id])),
    )
    this.rebuildIndexesInSession()
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
      runWithHydrateSource("user_write", () => {
        this.upsertManyInSession(entries)
      })
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
            markEntryReadHydrateDirty(entryId)
            entry.read = read
            draft.dirtyReadEntryIds.add(entryId)
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
            markEntryReadHydrateDirty(entry.id)
            entry.read = read
            draft.dirtyReadEntryIds.add(entry.id)
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
      draft.detailLoadedEntryIds.delete(entryId)
      draft.dirtyReadEntryIds.delete(entryId)
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
      return EntryService.purgeAllForMaintenance()
    })

    await tx.run()
  }
}

class EntrySyncServices {
  async fetchEntries(props: FetchEntriesProps) {
    const startedAt = performance.now()
    const result = await runtimeClient.entries.list({
      ...props,
      localFallbackEntries: Object.values(get().data),
    })

    // Load into Zustand store for detail-view lookups
    if (result.data.length > 0) {
      try {
        entryActions.upsertSummaries(result.data)
      } catch (err) {
        console.error("[Antigravity] upsertSummaries error", err)
      }
    }

    if ((globalThis as any).__suhuiPerformanceDebug === true) {
      console.info(
        "[Antigravity] fetchEntries returning page:",
        result.data.length,
        "cursor:",
        props.pageParam ?? "initial",
      )
    }
    console.info("[PerformanceMetric]", {
      metric: "entry_fetch_to_store_ms",
      value: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
    })

    return result
  }

  async fetchEntryDetail(entryId: EntryId | undefined, _isInbox?: boolean) {
    if (!entryId) return null

    const cached = getEntry(entryId)
    if (cached && entryActions.isDetailLoaded(entryId)) return cached

    const entry = await runtimeClient.entries.getDetail(entryId)
    if (entry) {
      entryActions.upsertDetails([entry])
      return entry
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
