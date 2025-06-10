import { views } from "@follow/constants"
import type {
  ExtractHonoParams,
  FeedModel,
  ListModel,
  ListModelPoplutedFeeds,
} from "@follow/models/types"

import { runTransactionInScope } from "~/database"
import { apiClient } from "~/lib/api-fetch"
import { ListService } from "~/services/list"

import { feedActions } from "../feed"
import { subscriptionActions } from "../subscription"
import { createImmerSetter, createTransaction, createZustandStore } from "../utils/helper"
import type { ListState } from "./types"

export const useListStore = createZustandStore<ListState>("list")(() => ({
  lists: {},
}))

const immerSet = createImmerSetter(useListStore)
const get = useListStore.getState

class ListActionStatic {
  upsertMany(lists: ListModelPoplutedFeeds[]) {
    if (lists.length === 0) return
    const feeds = [] as FeedModel[]

    immerSet((state) => {
      for (const list of lists) {
        state.lists[list.id] = list
      }
      return state
    })

    for (const list of lists) {
      if (!list.feeds) continue
      for (const feed of list.feeds) {
        feeds.push(feed)
      }
    }

    feedActions.upsertMany(feeds)

    runTransactionInScope(() => ListService.upsertMany(lists))
  }

  async fetchOwnedLists() {
    const res = await apiClient.lists.list.$get({ query: {} })
    this.upsertMany(res.data)

    return res.data
  }

  private patch(listId: string, data: Partial<ListModel>) {
    immerSet((state) => {
      state.lists[listId] = { ...state.lists[listId]!, ...data }
      return state
    })

    runTransactionInScope(async () => {
      const patchedData = get().lists[listId]
      if (!patchedData) return
      return ListService.upsert(patchedData as ListModel)
    })
  }
  addFeedToFeedList(listId: string, feed: FeedModel) {
    const list = get().lists[listId]
    if (!list) return
    feedActions.upsertMany([feed])

    this.patch(listId, {
      feedIds: [feed.id, ...list.feedIds],
    })
  }

  removeFeedFromFeedList(listId: string, feedId: string) {
    const list = get().lists[listId] as ListModel
    if (!list) return

    this.patch(listId, {
      feedIds: list.feedIds.filter((id) => id !== feedId),
    })
  }

  async deleteList(listId: string) {
    const deletedList = get().lists[listId]
    if (!deletedList) return
    const tx = createTransaction(deletedList)

    tx.optimistic(async () => {
      immerSet((state) => {
        delete state.lists[listId]
        return state
      })
    })
    tx.execute(async () => {
      await subscriptionActions.unfollow([listId])
      await apiClient.lists.$delete({
        json: {
          listId,
        },
      })
    })
    tx.rollback(async (s) => {
      immerSet((state) => {
        state.lists[listId] = s
        return state
      })
    })

    tx.persist(async () => {
      ListService.bulkDelete([listId])
    })
    await tx.run()
  }

  async fetchListById(id: string, noExtras?: boolean) {
    const res = await apiClient.lists.$get({ query: { listId: id, noExtras } })

    this.upsertMany([res.data.list])
    return res.data
  }

  async createList(data: Omit<InsertListModel, "listId">) {
    const tx = createTransaction<never, FeedModel>()
    tx.execute(async (_, ctx) => {
      const res = await apiClient.lists.$post({
        json: data,
      })

      Object.assign(ctx, res.data)
    })
    tx.persist(async (_, ctx) => {
      if (!ctx.id) return
      ListService.upsert({
        ...data,
        id: ctx.id,
        type: "list",
        feedIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: null,
      })

      const userId = ctx.ownerUserId
      if (!userId) return
      subscriptionActions.upsertMany([
        {
          listId: ctx.id,
          view: views[data.view]!.view,
          createdAt: new Date().toISOString(),
          title: data.title,
          userId,
          feedId: ctx.id,
          isPrivate: false,
        },
      ])
      this.upsertMany([
        {
          ...data,
          ...ctx,
          id: ctx.id,
          createdAt: new Date().toISOString(),
          updatedAt: null,
          type: "list",
          feedIds: [],
        },
      ])
    })
    tx.rollback(async (_, ctx) => {
      if (!ctx.id) return
      ListService.bulkDelete([ctx.id])
    })

    await tx.run()
  }
  async updateList(data: InsertListModel) {
    const tx = createTransaction()
    const snapshot = get().lists[data.listId]

    tx.execute(
      async () =>
        void (await apiClient.lists.$patch({
          json: {
            ...data,
          },
        })),
    )
    tx.optimistic(async () => {
      if (!snapshot) return

      this.upsertMany([
        {
          ...snapshot,
          ...data,
          id: data.listId,
          createdAt: snapshot?.createdAt,
          updatedAt: new Date().toISOString(),
          type: "list",
          view: data.view,
          feedIds: [],
          fee: data.fee,
        },
      ])
    })
    tx.persist(async () => {
      ListService.findAndUpdate(data.listId, data)

      if (!snapshot) return

      subscriptionActions.changeListView(
        data.listId,
        views[snapshot.view]!.view,
        views[data.view]!.view,
      )
    })
    tx.rollback(async () => {
      if (!snapshot) return
      this.upsertMany([snapshot])
    })

    await tx.run()
  }

  clear() {
    immerSet((state) => {
      state.lists = {}
    })
  }
}

export const listActions = new ListActionStatic()

export const getListById = (listId: string): Nullable<ListModel> =>
  useListStore.getState().lists[listId]

type InsertListModel = ExtractHonoParams<typeof apiClient.lists.$patch>
