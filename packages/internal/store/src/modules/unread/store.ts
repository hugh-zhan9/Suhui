import { FeedViewType } from "@follow/constants"
import type { UnreadSchema } from "@follow/database/schemas/types"
import { EntryService } from "@follow/database/services/entry"
import { UnreadService } from "@follow/database/services/unread"
import type { MarkAllAsReadRequest } from "@follow-app/client-sdk"
import { isEqual } from "es-toolkit"

import { api } from "../../context"
import type { Hydratable, Resetable } from "../../lib/base"
import { createTransaction, createZustandStore } from "../../lib/helper"
import { getEntry } from "../entry/getter"
import { entryActions } from "../entry/store"
import { setFeedUnreadDirty } from "../feed/hooks"
import { getListFeedIds } from "../list/getters"
import { getSubscribedFeedIdAndInboxHandlesByView } from "../subscription/getter"
import { applyUnreadCountForAffectedEntries, applyUnreadDeltaForAffectedEntries } from "./local-unread"
import { invalidateEntriesForUnreadMutation } from "./invalidate-entries"
import type {
  FeedIdOrInboxHandle,
  InsertedBeforeTimeRangeFilter,
  PublishAtTimeRangeFilter,
  UnreadState,
  UnreadStoreModel,
  UnreadUpdateOptions,
} from "./types"

const initialUnreadStore: UnreadState = {
  data: {},
}

export const useUnreadStore = createZustandStore<UnreadState>("unread")(() => initialUnreadStore)
const get = useUnreadStore.getState
const set = useUnreadStore.setState

class UnreadSyncService {
  private readonly markReadInFlight = new Set<string>()

  async resetFromRemote() {
    // [Local Mode] No remote reads API, return current local state
    return get().data
  }

  private async updateUnreadStatus({
    ids,
    time,
    read,
    request,
  }: {
    ids: FeedIdOrInboxHandle[]
    time?: PublishAtTimeRangeFilter | InsertedBeforeTimeRangeFilter
    read: boolean
    request: () => Promise<UnreadStoreModel>
  }) {
    if (!ids || ids.length === 0) return

    const currentUnreadList = ids.map((id) => ({ id, count: get().data[id] || 0 }))
    const newUnreadListWhenNoTimeFilter = ids.map((id) => ({ id, count: 0 }))

    let affectedEntryIds: string[] = []

    const tx = createTransaction<unknown, unknown, UnreadStoreModel>()

    tx.store(() => {
      affectedEntryIds = entryActions.markEntryReadStatusInSession({
        ids,
        read,
        time,
      })

      if (!time && read) {
        unreadActions.upsertManyInSession(newUnreadListWhenNoTimeFilter)
      } else {
        const currentCounts = Object.fromEntries(currentUnreadList.map((item) => [item.id, item.count]))
        const affectedEntries = affectedEntryIds
          .map((entryId) => getEntry(entryId))
          .filter((entry): entry is NonNullable<typeof entry> => !!entry)
          .map((entry) => ({ feedId: entry.feedId, inboxHandle: entry.inboxHandle }))

        const nextUnreadList = read
          ? applyUnreadDeltaForAffectedEntries({
              currentCounts,
              affectedEntries,
            })
          : applyUnreadCountForAffectedEntries({
              currentCounts,
              affectedEntries,
              operation: "increment",
            })
        unreadActions.upsertManyInSession(nextUnreadList)
      }
    })

    tx.request(request)

    tx.rollback(async () => {
      entryActions.markEntryReadStatusInSession({
        entryIds: affectedEntryIds,
        read: !read,
      })

      unreadActions.upsertManyInSession(currentUnreadList)
    })

    tx.persist(async (_s, _c, res) => {
      if (!time && read) {
        await UnreadService.upsertMany(newUnreadListWhenNoTimeFilter)
      } else {
        if (read && res) {
          await unreadActions.changeBatch(res, "decrement")
        } else {
          const currentCounts = Object.fromEntries(currentUnreadList.map((item) => [item.id, item.count]))
          const affectedEntries = affectedEntryIds
            .map((entryId) => getEntry(entryId))
            .filter((entry): entry is NonNullable<typeof entry> => !!entry)
            .map((entry) => ({ feedId: entry.feedId, inboxHandle: entry.inboxHandle }))

          const nextUnreadList = read
            ? applyUnreadDeltaForAffectedEntries({
                currentCounts,
                affectedEntries,
              })
            : applyUnreadCountForAffectedEntries({
                currentCounts,
                affectedEntries,
                operation: "increment",
              })

          await UnreadService.upsertMany(nextUnreadList)
        }
      }

      await EntryService.patchMany({
        feedIds: ids,
        entry: { read },
        time,
      })
    })

    ids.forEach((id) => {
      if (id) {
        setFeedUnreadDirty(id)
      }
    })

    await tx.run()

    await invalidateEntriesForUnreadMutation()
  }

  async markBatchAsRead({
    view,
    filter,
    time,
    excludePrivate,
  }: {
    view: FeedViewType | undefined
    filter?: {
      feedId?: string
      listId?: string
      feedIdList?: string[]
      inboxId?: string
      insertedBefore?: number
    } | null
    time?: PublishAtTimeRangeFilter | InsertedBeforeTimeRangeFilter
    excludePrivate: boolean
  }) {
    const request = async () => {
      // [Local Mode] No remote API call for mark-all-as-read
      // Return empty object as the store/persist layers handle state locally
      return {} as UnreadStoreModel
    }

    if (filter?.feedIdList) {
      await this.updateUnreadStatus({ ids: filter.feedIdList, time, read: true, request })
    } else if (filter?.feedId) {
      await this.updateUnreadStatus({ ids: [filter.feedId], time, read: true, request })
    } else if (filter?.listId) {
      const feedIds = getListFeedIds(filter.listId)
      if (feedIds && feedIds.length > 0) {
        await this.updateUnreadStatus({ ids: feedIds, time, read: true, request })
      }
    } else if (filter?.inboxId) {
      await this.updateUnreadStatus({ ids: [filter.inboxId], time, read: true, request })
    } else {
      const feedIdAndInboxHandles = getSubscribedFeedIdAndInboxHandlesByView({
        view,
        excludePrivate,
        excludeHidden: true,
      })
      await this.updateUnreadStatus({ ids: feedIdAndInboxHandles, time, read: true, request })
    }
  }

  async markViewAsRead(view: FeedViewType, excludePrivate: boolean) {
    await this.markBatchAsRead({
      view: view === FeedViewType.All ? undefined : view,
      excludePrivate,
    })
  }

  async markFeedAsRead(feedId: string | string[], time?: PublishAtTimeRangeFilter) {
    const feedIds = Array.isArray(feedId) ? feedId : [feedId]

    await this.markBatchAsRead({
      view: undefined,
      excludePrivate: false,
      filter: {
        feedIdList: feedIds,
      },
      time,
    })
  }

  async markFeedAsUnread(feedId: string | string[]) {
    const feedIds = Array.isArray(feedId) ? feedId : [feedId]
    if (feedIds.length === 0) return
    await this.updateUnreadStatus({
      ids: feedIds,
      read: false,
      request: async () => ({} as UnreadStoreModel),
    })
  }

  async markListAsRead(listId: string, time?: PublishAtTimeRangeFilter) {
    await this.markBatchAsRead({
      view: undefined,
      excludePrivate: false,
      filter: {
        listId,
      },
      time,
    })
  }

  async markListAsUnread(listId: string) {
    const feedIds = getListFeedIds(listId)
    if (!feedIds || feedIds.length === 0) return
    await this.updateUnreadStatus({
      ids: feedIds,
      read: false,
      request: async () => ({} as UnreadStoreModel),
    })
  }

  private async markEntryReadStatus({ entryId, read }: { entryId: string; read: boolean }) {
    const entry = getEntry(entryId)
    if (!entry || entry.read === read || (!entry.feedId && !entry.inboxHandle)) return

    const id: FeedIdOrInboxHandle = entry.inboxHandle || entry.feedId || ""

    const tx = createTransaction()
    tx.store(() => {
      entryActions.markEntryReadStatusInSession({ entryIds: [entryId], read })
      if (read) {
        unreadActions.removeUnread(id)
      } else {
        unreadActions.addUnread(id)
      }
    })

    tx.request(async () => {
      // [Local Mode] No remote API call for read/unread status
      // The store and persist layers handle state locally
    })

    tx.rollback(() => {
      entryActions.markEntryReadStatusInSession({ entryIds: [entryId], read: !read })
      if (read) {
        unreadActions.addUnread(id)
      } else {
        unreadActions.removeUnread(id)
      }
    })

    tx.persist(async () => {
      // [Local Mode] Persist via IPC to main process SQLite
      if (typeof window !== "undefined" && (window as any).electron?.ipcRenderer) {
        await (window as any).electron.ipcRenderer.invoke("db.updateReadStatus", {
          entryIds: [entryId],
          read,
        })
      } else {
        // Fallback for web (no-op for now)
        return EntryService.patchMany({
          entry: { read },
          entryIds: [entryId],
        })
      }
    })

    if (entry.feedId) {
      setFeedUnreadDirty(entry.feedId)
    }
    await tx.run()
  }

  private async emitMarkReadEvent({ entryId, read }: { entryId: string; read: boolean }) {
    if (!entryId) return

    const currentEntry = getEntry(entryId)
    if (!currentEntry || currentEntry.read === read) return
    if (this.markReadInFlight.has(entryId)) return

    this.markReadInFlight.add(entryId)
    try {
      await this.markEntryReadStatus({ entryId, read })
    } finally {
      this.markReadInFlight.delete(entryId)
    }
  }

  async markRead(entryId: string) {
    return this.emitMarkReadEvent({ entryId, read: true })
  }

  async markUnread(entryId: string) {
    return this.emitMarkReadEvent({ entryId, read: false })
  }

  async markEntryAsRead(entryId: string) {
    return this.markRead(entryId)
  }

  async markEntryAsUnread(entryId: string) {
    return this.markUnread(entryId)
  }
}

class UnreadActions implements Hydratable, Resetable {
  async hydrate() {
    const unreads = await UnreadService.getUnreadAll()
    this.upsertManyInSession(unreads)
  }

  upsertManyInSession(unreads: UnreadSchema[], options?: UnreadUpdateOptions) {
    const state = useUnreadStore.getState()
    const nextData = options?.reset ? {} : { ...state.data }
    for (const unread of unreads) {
      nextData[unread.id] = unread.count
    }
    set({
      data: nextData,
    })
  }

  async upsertMany(unreads: UnreadSchema[] | UnreadStoreModel, options?: UnreadUpdateOptions) {
    const normalizedUnreads = Array.isArray(unreads)
      ? unreads
      : Object.entries(unreads).map(([id, count]) => ({ id, count }))

    const tx = createTransaction()
    tx.store(() => this.upsertManyInSession(normalizedUnreads, options))
    tx.persist(() => UnreadService.upsertMany(normalizedUnreads, options))
    await tx.run()
  }

  async changeBatch(updates: UnreadStoreModel, type: "decrement" | "increment") {
    const state = useUnreadStore.getState()
    const dataToUpsert = Object.entries(updates).map(([id, count]) => {
      const currentCount = state.data[id] || 0
      return {
        id,
        count: type === "increment" ? currentCount + count : Math.max(0, currentCount - count),
      }
    })
    await this.upsertMany(dataToUpsert)
  }

  addUnread(id: FeedIdOrInboxHandle, count = 1) {
    const state = useUnreadStore.getState()
    const cur = state.data[id] ?? 0
    if (count <= 0) return cur
    this.upsertMany([{ id, count: cur + count }])
    return cur
  }

  removeUnread(id: FeedIdOrInboxHandle, count = 1) {
    const state = useUnreadStore.getState()
    const cur = state.data[id] ?? 0
    if (count <= 0) return cur
    this.upsertMany([{ id, count: Math.max(0, cur - count) }])
    return cur
  }

  incrementById(id: FeedIdOrInboxHandle, count: number) {
    return count > 0 ? this.addUnread(id, count) : this.removeUnread(id, -count)
  }

  async updateById(id: FeedIdOrInboxHandle | undefined | null, count: number) {
    if (!id) return
    const state = useUnreadStore.getState()
    const cur = state.data[id] ?? 0
    if (cur === count) return
    await this.upsertMany([{ id, count }])
  }

  subscribeUnreadCount(fn: (count: number) => void, immediately?: boolean) {
    const handler = (state: UnreadState): void => {
      let unread = 0
      for (const key in state.data) {
        unread += state.data[key] ?? 0
      }

      fn(unread)
    }
    if (immediately) {
      handler(get())
    }
    return useUnreadStore.subscribe(handler)
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(initialUnreadStore)
    })

    tx.persist(() => {
      return UnreadService.reset()
    })

    await tx.run()
  }
}

export const unreadActions = new UnreadActions()
export const unreadSyncService = new UnreadSyncService()
