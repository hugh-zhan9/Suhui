import { FeedViewType } from "@follow/constants"
import { EntryService } from "@follow/database/services/entry"
import { isBizId } from "@follow/utils"
import { cloneDeep } from "es-toolkit"
import { debounce } from "es-toolkit/compat"

import { api } from "../../context"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { readNdjsonStream } from "../../lib/stream"
import { apiMorph } from "../../morph/api"
import { dbStoreMorph } from "../../morph/db-store"
import { storeDbMorph } from "../../morph/store-db"
import { collectionActions } from "../collection/store"
import { clearAllFeedUnreadDirty, clearFeedUnreadDirty } from "../feed/hooks"
import { feedActions } from "../feed/store"

import { getDefaultCategory } from "../subscription/utils"
import type {
  FeedIdOrInboxHandle,
  InsertedBeforeTimeRangeFilter,
  PublishAtTimeRangeFilter,
} from "../unread/types"
import { userActions } from "../user/store"
import { getEntry } from "./getter"
import type { EntryModel, FetchEntriesProps, FetchEntriesPropsSettings } from "./types"
import { getEntriesParams } from "./utils"

type EntryId = string
type FeedId = string
type InboxId = string
type Category = string
type ListId = string

import { type EntryState, defaultState, useEntryStore } from "./base"
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

    const { getSubscriptionById } = require("../subscription/getter")
    const subscription = getSubscriptionById(feedId)
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
      const { getSubscriptionById } = require("../subscription/getter")
      const subscription = getSubscriptionById(s)
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
    const { getSubscriptionById } = require("../subscription/getter")
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

    immerSet((draft) => {
      for (const entry of entries) {
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

        entry.sources
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
    readabilityUpdatedAt?: Date
  }) {
    immerSet((draft) => {
      const entry = draft.data[entryId]
      if (!entry) return
      if (content) {
        entry.content = content
      }
      if (readabilityContent) {
        entry.readabilityContent = readabilityContent
        entry.readabilityUpdatedAt = readabilityUpdatedAt
      }
    })
  }

  async updateEntryContent({
    entryId,
    content,
    readabilityContent,
    readabilityUpdatedAt = new Date(),
  }: {
    entryId: EntryId
    content?: string
    readabilityContent?: string
    readabilityUpdatedAt?: Date
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
    // [Local Mode] Query entries from the local SQLite DB via IPC, then cache in store
    const { feedId, feedIdList } = props

    let entries: any[] = []

    if (typeof window !== "undefined" && (window as any).electron?.ipcRenderer) {
      const ipc = (window as any).electron.ipcRenderer
      if (feedId) {
        // feedId may be comma-separated (folder view)
        const feedIds = feedId.includes(",") ? feedId.split(",") : [feedId]
        const results = await Promise.all(
          feedIds.map((id: string) => ipc.invoke("db.getEntries", id)),
        )
        entries = results.flat()
      } else if (feedIdList && feedIdList.length > 0) {
        const results = await Promise.all(
          feedIdList.map((id: string) => ipc.invoke("db.getEntries", id)),
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

    // Sort by publishedAt descending
    entries.sort((a, b) => {
      const dateA = a.publishedAt instanceof Date ? a.publishedAt.getTime() : Number(a.publishedAt ?? 0)
      const dateB = b.publishedAt instanceof Date ? b.publishedAt.getTime() : Number(b.publishedAt ?? 0)
      return dateB - dateA
    })

    // Load into Zustand store so detail-view lookups via getEntry(id) work
    if (entries.length > 0) {
      entryActions.upsertManyInSession(entries)
    }

    return {
      data: entries.map((e: any) => ({ entries: e, feeds: { id: e.feedId, type: "feed" } })),
    } as any
  }

  async fetchEntryDetail(entryId: EntryId | undefined, isInbox?: boolean) {
    if (!entryId) return null

    // First check in-memory store (populated by fetchEntries)
    const cached = getEntry(entryId)
    if (cached) return cached

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
      entry.readabilityUpdatedAt.getTime() > Date.now() - 1000 * 60 * 60 * 24 * 3
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

  async fetchEntryContentByStream(remoteEntryIds?: string[]) {
    // [Local Mode] Entry contents are fully fetched from local storage.
    // No need to query remote stream API.
    return
  }

  async fetchEntryReadHistory(entryId: EntryId, size: number) {
    const res = await api().entries.readHistories({
      id: entryId,
      size,
    })

    await userActions.upsertMany(Object.values(res.data.users))

    return res.data
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
