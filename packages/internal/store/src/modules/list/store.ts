import { ListService } from "@suhui/database/services/list"

import type { Hydratable, Resetable } from "../../lib/base"
import { createTransaction, createZustandStore } from "../../lib/helper"
import { storeDbMorph } from "../../morph/store-db"
import { whoami } from "../user/getters"
import type { CreateListModel, ListModel } from "./types"

type ListId = string
interface ListState {
  lists: Record<ListId, ListModel>
  listIds: ListId[]
}

const defaultState: ListState = {
  lists: {},
  listIds: [],
}

export const useListStore = createZustandStore<ListState>("list")(() => defaultState)

const get = useListStore.getState
const set = useListStore.setState
class ListActions implements Hydratable, Resetable {
  async hydrate() {
    const lists = await ListService.getListAll()
    listActions.upsertManyInSession(
      lists.map((list) => ({
        ...list,
        feedIds:
          typeof list.feedIds === "string"
            ? (JSON.parse(list.feedIds || "[]") as string[])
            : Array.isArray(list.feedIds)
              ? list.feedIds
              : [],
        type: "list" as const,
      })),
    )
  }

  upsertManyInSession(lists: ListModel[]) {
    const state = get()

    set({
      ...state,
      lists: { ...state.lists, ...Object.fromEntries(lists.map((list) => [list.id, list])) },
      listIds: [...state.listIds, ...lists.map((list) => list.id)],
    })
  }

  async upsertMany(lists: ListModel[]) {
    const tx = createTransaction()
    tx.store(() => {
      this.upsertManyInSession(lists)
    })

    tx.persist(() => {
      return ListService.upsertMany(lists.map((list) => storeDbMorph.toListSchema(list)))
    })
    await tx.run()
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(defaultState)
    })

    tx.persist(() => {
      return ListService.purgeAllForMaintenance()
    })

    await tx.run()
  }
}

export const listActions = new ListActions()

class ListSyncServices {
  /**
   * Lists are read from the hydrated store; there is no remote list service and
   * nothing local creates lists. Callers already tolerate a miss.
   */
  async fetchListById(_params: { id: string | undefined }) {
    return null
  }

  /**
   * 列表在本地就是一组订阅的分组：id 本地生成，直接落本地表。
   * 原实现走远端的 lists.create，而远端服务已不存在。
   */
  async createList(params: { list: CreateListModel }) {
    const userId = whoami()?.id || ""
    const list: ListModel = {
      id: crypto.randomUUID(),
      title: params.list.title,
      description: params.list.description,
      image: params.list.image,
      view: params.list.view,
      feedIds: [],
      fee: 0,
      userId,
      ownerUserId: userId || null,
      subscriptionCount: null,
      purchaseAmount: null,
      deletedAt: null,
      type: "list",
    }

    await listActions.upsertMany([list])

    const { subscriptionActions } = await import("../subscription/store")
    await subscriptionActions.upsertMany([
      {
        isPrivate: false,
        listId: list.id,
        type: "list",
        userId,
        view: list.view,
        createdAt: new Date().toISOString(),
      },
    ])

    return list
  }

  async updateList(params: { listId: string; list: CreateListModel }) {
    const tx = createTransaction()
    const snapshot = get().lists[params.listId]
    if (!snapshot) return

    const nextModel = {
      title: params.list.title,
      description: params.list.description,
      image: params.list.image,
      view: params.list.view,
      listId: params.listId,
    }

    tx.store(async () => {
      await listActions.upsertMany([
        {
          ...snapshot,
          ...nextModel,
        },
      ])
    })

    tx.persist(async () => {
      if (params.list.view === snapshot.view) return
      const { subscriptionSyncService } = await import("../subscription/store")
      await subscriptionSyncService.changeListView({
        listId: params.listId,
        view: params.list.view,
      })
    })

    tx.rollback(async () => {
      await listActions.upsertMany([snapshot])
    })

    await tx.run()
  }

  /**
   * 加入列表的订阅源本来就已经在本地库里（都是从已订阅的源上操作的），
   * 所以只需要维护列表自己的 feedIds，不需要远端把 feed 再回传一遍。
   */
  async addFeedsToFeedList(
    params: { listId: string; feedIds: string[] } | { listId: string; feedId: string },
  ) {
    const list = get().lists[params.listId]
    if (!list) return

    const incoming = "feedIds" in params ? params.feedIds : [params.feedId]
    const feedIds = [...new Set([...list.feedIds, ...incoming])]
    if (feedIds.length === list.feedIds.length) return

    await listActions.upsertMany([{ ...list, feedIds }])
  }

  async removeFeedFromFeedList(params: { listId: string; feedId: string }) {
    const list = get().lists[params.listId]
    if (!list) return

    const feedIds = list.feedIds.filter((id) => id !== params.feedId)
    await listActions.upsertMany([{ ...list, feedIds }])
  }
}

export const listSyncServices = new ListSyncServices()
