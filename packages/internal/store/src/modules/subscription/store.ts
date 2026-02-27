import { FeedViewType } from "@follow/constants"
import type { CollectionSchema } from "@follow/database/schemas/types"
import { SubscriptionService } from "@follow/database/services/subscription"
import { tracker } from "@follow/tracker"
import { omit } from "es-toolkit"

import { api, queryClient } from "../../context"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { apiMorph } from "../../morph/api"

import { buildSubscriptionDbId, storeDbMorph } from "../../morph/store-db"
import { collectionActions, useCollectionStore } from "../collection/store"
import { invalidateEntriesQuery } from "../entry/hooks"
import { entryActions } from "../entry/store"
import { dbStoreMorph } from "../../morph/db-store"
import { getFeedById } from "../feed/getter"
import { feedActions } from "../feed/store"
import { inboxActions } from "../inbox/store"
import { getListById } from "../list/getters"
import { listActions } from "../list/store"
import { unreadActions } from "../unread/store"
import { whoami } from "../user/getters"
import { getCategoryFeedIds } from "./getter"
import type { SubscriptionForm, SubscriptionModel } from "./types"
import { getDefaultCategory, getSubscriptionDBId, getSubscriptionStoreId } from "./utils"

type FeedId = string
type ListId = string

export interface SubscriptionState {
  /**
   * Key: FeedId, ListId, `inbox/${inboxId}`
   * Value: SubscriptionPlainModel
   */
  data: Record<string, SubscriptionModel>

  feedIdByView: Record<FeedViewType, Set<FeedId>>

  listIdByView: Record<FeedViewType, Set<ListId>>

  /**
   * All named categories names set
   */
  categories: Record<FeedViewType, Set<string>>
  /**
   * All subscription ids set
   */
  subscriptionIdSet: Set<string>

  categoryOpenStateByView: Record<FeedViewType, Record<string, boolean>>
}

const emptyDataSetByView: Record<FeedViewType, Set<FeedId>> = {
  [FeedViewType.All]: new Set(),
  [FeedViewType.Articles]: new Set(),
  [FeedViewType.Audios]: new Set(),
  [FeedViewType.Notifications]: new Set(),
  [FeedViewType.Pictures]: new Set(),
  [FeedViewType.SocialMedia]: new Set(),
  [FeedViewType.Videos]: new Set(),
}
const emptyCategoryOpenStateByView: Record<FeedViewType, Record<string, boolean>> = {
  [FeedViewType.All]: {},
  [FeedViewType.Articles]: {},
  [FeedViewType.Audios]: {},
  [FeedViewType.Notifications]: {},
  [FeedViewType.Pictures]: {},
  [FeedViewType.SocialMedia]: {},
  [FeedViewType.Videos]: {},
}

const defaultState: SubscriptionState = {
  data: {},
  feedIdByView: { ...emptyDataSetByView },
  listIdByView: { ...emptyDataSetByView },
  categories: { ...emptyDataSetByView },
  subscriptionIdSet: new Set(),
  categoryOpenStateByView: { ...emptyCategoryOpenStateByView },
}

const invalidateViews = (...views: (FeedViewType | undefined)[]) => {
  const viewSet = new Set<FeedViewType>()

  for (const view of views) {
    if (view === undefined) continue
    viewSet.add(view)
  }

  if (viewSet.size === 0) return

  viewSet.add(FeedViewType.All)

  invalidateEntriesQuery({
    views: Array.from(viewSet),
  })
}

export const getCollectionEntryIdsByFeedIds = (
  collections: Record<string, CollectionSchema>,
  feedIds: string[],
) => {
  if (feedIds.length === 0) return []
  const feedIdSet = new Set(feedIds)
  return Object.values(collections)
    .filter((collection) => !!collection.feedId && feedIdSet.has(collection.feedId))
    .map((collection) => collection.entryId)
}

export const useSubscriptionStore = createZustandStore<SubscriptionState>("subscription")(
  () => defaultState,
)

const get = useSubscriptionStore.getState

const immerSet = createImmerSetter(useSubscriptionStore)

export const shouldUseLocalSubscriptionMutation = (win: any = globalThis.window) => {
  return !!win?.electron?.ipcRenderer
}

class SubscriptionActions implements Hydratable, Resetable {
  async hydrate() {
    const subscriptions = await SubscriptionService.getSubscriptionAll()
    subscriptionActions.upsertManyInSession(
      subscriptions.map((s) => dbStoreMorph.toSubscriptionModel(s)),
    )
  }
  async upsertManyInSession(subscriptions: SubscriptionModel[]) {
    immerSet((draft) => {
      for (const subscription of subscriptions) {
        const subscriptionSetId = getSubscriptionDBId(subscription)
        const subscriptionStoreId = getSubscriptionStoreId(subscription)

        draft.data[subscriptionStoreId] = subscription
        draft.subscriptionIdSet.add(subscriptionSetId)

        if (subscription.feedId && subscription.type === "feed") {
          draft.feedIdByView[subscription.view].add(subscription.feedId)
          draft.feedIdByView[FeedViewType.All].add(subscription.feedId)
          if (subscription.category) {
            draft.categories[subscription.view].add(subscription.category)
          }
        }
        if (subscription.listId && subscription.type === "list") {
          draft.listIdByView[subscription.view].add(subscription.listId)
          draft.listIdByView[FeedViewType.All].add(subscription.listId)
        }
      }
    })
  }
  async upsertMany(
    subscriptions: SubscriptionModel[],
    options: { resetBeforeUpsert?: boolean | FeedViewType } = {},
  ) {
    const tx = createTransaction()
    tx.store(() => {
      if (options.resetBeforeUpsert !== undefined) {
        if (typeof options.resetBeforeUpsert === "boolean") {
          this.reset()
        } else {
          this.resetByView(options.resetBeforeUpsert)
        }
      }
      this.upsertManyInSession(subscriptions)
    })

    tx.persist(() => {
      return SubscriptionService.upsertMany(
        subscriptions.map((s) => storeDbMorph.toSubscriptionSchema(s)),
      )
    })

    await tx.run()
  }

  resetByView(view: FeedViewType) {
    immerSet((draft) => {
      draft.feedIdByView[view] = new Set()
      draft.listIdByView[view] = new Set()
      draft.categories[view] = new Set()
      draft.subscriptionIdSet = new Set()
    })
  }

  toggleCategoryOpenState(view: FeedViewType, category: string) {
    immerSet((state) => {
      state.categoryOpenStateByView[view][category] = !state.categoryOpenStateByView[view][category]
    })
  }

  changeCategoryOpenState(view: FeedViewType, category: string, status: boolean) {
    immerSet((state) => {
      state.categoryOpenStateByView[view][category] = status
    })
  }

  expandCategoryOpenStateByView(view: FeedViewType, isOpen: boolean) {
    immerSet((state) => {
      for (const category in state.categoryOpenStateByView[view]) {
        state.categoryOpenStateByView[view][category] = isOpen
      }
    })
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      // set(defaultState)
      immerSet((draft) => {
        Object.assign(draft, omit(defaultState, ["categoryOpenStateByView"]))
      })
    })

    tx.persist(() => {
      return SubscriptionService.reset()
    })

    await tx.run()
  }
}

class SubscriptionSyncService {
  async fetch(view?: FeedViewType) {
    // [Local Mode] Return subscriptions from the local Zustand store
    const storeData = get().data
    const allSubscriptions = Object.values(storeData)
    const filtered = view !== undefined
      ? allSubscriptions.filter((s: any) => s.view === view)
      : allSubscriptions

    // Also gather associated feeds from the feed store
    const feedStore = (await import("../feed/store")).useFeedStore.getState()
    const feedIds = new Set(filtered.map((s: any) => s.feedId).filter(Boolean))
    const feeds = Object.values(feedStore.feeds).filter((f: any) => feedIds.has(f.id))

    return { subscriptions: filtered, feeds }
  }

  async edit(subscription: SubscriptionModel) {
    const subscriptionId = getSubscriptionStoreId(subscription)
    const current = get().data[subscriptionId]
    if (!current) {
      return
    }
    const tx = createTransaction(current)

    let addNewCategory = false
    tx.store(() => {
      immerSet((draft) => {
        if (
          subscription.category &&
          !draft.categories[subscription.view].has(subscription.category)
        ) {
          addNewCategory = true
          draft.categories[subscription.view].add(subscription.category)
        }

        if (subscription.type === "feed") {
          draft.feedIdByView[current.view].delete(current.feedId!)
          draft.feedIdByView[subscription.view].add(subscription.feedId!)
        }

        draft.data[subscriptionId] = subscription
      })
    })
    tx.rollback((current) => {
      immerSet((draft) => {
        if (addNewCategory && subscription.category) {
          draft.categories[subscription.view].delete(subscription.category)
        }

        if (subscription.type === "feed") {
          draft.feedIdByView[subscription.view].delete(subscription.feedId!)
          draft.feedIdByView[current.view].add(current.feedId!)
        }

        draft.data[subscriptionId] = current
      })
    })
    tx.request(async () => {
      if (shouldUseLocalSubscriptionMutation()) return
      await api().subscriptions.update({
        ...subscription,
        feedId: subscription.feedId ?? undefined,
        listId: subscription.listId ?? undefined,
      })
    })

    tx.persist(() => {
      return SubscriptionService.patch(storeDbMorph.toSubscriptionSchema(subscription))
    })

    await tx.run()
    entryActions.rebuildIndexesInSession()
    await queryClient().invalidateQueries({
      queryKey: ["entries"],
    })
    invalidateViews(current.view, subscription.view)
  }

  async subscribe(subscription: SubscriptionForm) {
    let data: any = null
    if (typeof window !== "undefined" && (window as any).electron?.ipcRenderer) {
      // Local IPC mode
      data = await (window as any).electron.ipcRenderer.invoke("db.addFeed", subscription)
      if (!data) {
        throw new Error("Failed to subscribe via local database")
      }
    } else {
      // [Local Mode] Web fallback: fetch RSS via dev server proxy, parse locally
      const proxyUrl = `/api/rss-proxy?url=${encodeURIComponent(subscription.url || "")}`
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

      // Use the feedId from the preview phase if already assigned
      const feedId = (subscription as any).feedId || `local_feed_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const subId = `local_sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      data = {
        feed: {
          type: "feed" as const,
          id: feedId,
          title: subscription.title || feedTitle,
          url: subscription.url || "",
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
          id: subId,
          feedId,
          userId: "local_user_id",
          view: subscription.view,
          isPrivate: false,
          title: subscription.title || feedTitle || null,
          category: subscription.category || null,
          type: "feed" as const,
          createdAt: new Date().toISOString(),
        },
      }
    }

    if (data.feed) {
      feedActions.upsertMany([data.feed])
      tracker.subscribe({ feedId: data.feed.id, view: subscription.view })
    }

    // Insert to subscription first so that entry hydration can bind to its view!
    if (typeof window !== "undefined" && (window as any).electron?.ipcRenderer && data.subscription) {
      // Local IPC mode: DB already persisted it, just update the in-memory store
      subscriptionActions.upsertManyInSession([dbStoreMorph.toSubscriptionModel(data.subscription)])
    } else {
      // Web fallback: construct the object and try to persist via network
      await subscriptionActions.upsertMany([
        {
          ...subscription,
          title: subscription.title ?? null,
          category: subscription.category ?? null,

          type: data.list ? "list" : "feed",
          createdAt: new Date().toISOString(),
          feedId: data.feed?.id ?? null,
          listId: data.list?.id ?? null,
          inboxId: null,
          userId: whoami()?.id ?? "",
        },
      ])
    }

    // Immediately hydrate entry store with entries returned from IPC (or from web fallback)
    if (data.entries && data.entries.length > 0) {
      entryActions.upsertManyInSession(data.entries.map((e: any) => dbStoreMorph.toEntryModel(e)))
    }

    if (data.list) {
      listActions.upsertMany([
        {
          ...data.list,
          userId: data.list.ownerUserId,
          type: "list",
          subscriptionCount: null,
          purchaseAmount: null,
        },
      ])
      tracker.subscribe({ listId: data.list.id, view: subscription.view })
    }

    if (data.unread) {
      unreadActions.upsertMany(data.unread)
    }

    invalidateViews(subscription.view)
  }

  async unsubscribe(id: string | undefined | null | (string | undefined | null)[]) {
    const normalizedIds = (Array.isArray(id) ? id : [id]).filter((i) => typeof i === "string")
    const subscriptionList = normalizedIds.map((id) => get().data[id]).filter((i) => !!i)
    const feedsAndLists = normalizedIds
      .map((id) => getFeedById(id) ?? getListById(id))
      .filter((i) => !!i)
    if (subscriptionList.length === 0) return feedsAndLists

    const feedSubscriptions = subscriptionList.filter((i) => i.type === "feed")
    const listSubscriptions = subscriptionList.filter((i) => i.type === "list")

    const tx = createTransaction(subscriptionList)

    tx.store(() => {
      immerSet((draft) => {
        for (const id of normalizedIds) {
          const subscription = draft.data[id]
          if (!subscription) continue
          draft.subscriptionIdSet.delete(getSubscriptionDBId(subscription))
          if (subscription.feedId) {
            draft.feedIdByView[subscription.view].delete(subscription.feedId)
            draft.feedIdByView[FeedViewType.All].delete(subscription.feedId)
          }
          if (subscription.listId) {
            draft.listIdByView[subscription.view].delete(subscription.listId)
            draft.listIdByView[FeedViewType.All].delete(subscription.listId)
          }
          if (subscription.category) {
            draft.categories[subscription.view].delete(subscription.category)
            draft.categories[FeedViewType.All].delete(subscription.category)
          }
          delete draft.data[id]
        }
      })
    })

    tx.request(async () => {
      // [Local Mode] No remote API call needed for unsubscribe
      // The store update above already removes the subscription from local state
    })

    tx.rollback((current) => {
      immerSet((draft) => {
        for (const [index, id] of normalizedIds.entries()) {
          const subscription = current[index]
          if (!subscription) continue

          draft.data[id] = subscription

          draft.subscriptionIdSet.add(getSubscriptionDBId(subscription))
          if (subscription.feedId) {
            draft.feedIdByView[subscription.view].add(subscription.feedId)
            draft.feedIdByView[FeedViewType.All].add(subscription.feedId)
          }
          if (subscription.listId) {
            draft.listIdByView[subscription.view].add(subscription.listId)
            draft.listIdByView[FeedViewType.All].add(subscription.listId)
          }
          if (subscription.category) {
            draft.categories[subscription.view].add(subscription.category)
            draft.categories[FeedViewType.All].add(subscription.category)
          }
        }
      })
    })

    tx.persist(async () => {
      const payload = {
        ids: subscriptionList.map((i) => buildSubscriptionDbId(i)),
        feedIds: subscriptionList.map((i) => i.feedId).filter((i): i is string => !!i),
        listIds: subscriptionList.map((i) => i.listId).filter((i): i is string => !!i),
        inboxIds: subscriptionList.map((i) => i.inboxId).filter((i): i is string => !!i),
      }

      if (typeof window !== "undefined" && (window as any).electron?.ipcRenderer) {
        return (window as any).electron.ipcRenderer.invoke("db.deleteSubscriptionByTargets", payload)
      } else {
        return SubscriptionService.deleteByTargets(payload)
      }
    })

    await tx.run()
    // Rebuild all entry indexes to purge stale in-memory mappings after unsubscribe.
    entryActions.rebuildIndexesInSession()
    await queryClient().invalidateQueries({
      queryKey: ["entries"],
    })
    const affectedViews = Array.from(
      new Set([...feedSubscriptions, ...listSubscriptions].map((i) => i.view)),
    )
    invalidateViews(...affectedViews)

    const removedFeedIds = feedSubscriptions
      .map((subscription) => subscription.feedId)
      .filter((feedId): feedId is string => !!feedId)
    if (removedFeedIds.length > 0) {
      const collectionEntryIds = getCollectionEntryIdsByFeedIds(
        useCollectionStore.getState().collections,
        removedFeedIds,
      )
      if (collectionEntryIds.length > 0) {
        await collectionActions.delete(collectionEntryIds)
        invalidateEntriesQuery({ collection: true })
      }
    }

    feedSubscriptions.forEach((i) => {
      unreadActions.updateById(i.feedId, 0)
    })
    return feedsAndLists
  }

  async batchUpdateSubscription({
    feedIds,
    category: newCategory,
    view: newView,
  }: {
    feedIds: string[]
    category?: string | null
    view: FeedViewType
  }) {
    const current = feedIds
      .map((id) => get().data[id])
      .map((i) =>
        i
          ? {
              view: i.view,
              category: i.category,
            }
          : null,
      )

    const tx = createTransaction()
    tx.store(() => {
      immerSet((draft) => {
        for (const feedId of feedIds) {
          const subscription = draft.data[feedId]
          if (!subscription) continue

          const currentView = subscription.view
          draft.feedIdByView[currentView].delete(feedId)
          draft.feedIdByView[newView].add(feedId)
          subscription.view = newView

          if (newCategory) {
            draft.categories[newView].add(newCategory)
            subscription.category = newCategory
          }
        }
      })
    })

    tx.request(async () => {
      if (shouldUseLocalSubscriptionMutation()) return
      await api().subscriptions.batchUpdate({
        feedIds,
        category: newCategory,
        view: newView,
      })
    })

    tx.rollback(() => {
      immerSet((draft) => {
        for (const [index, feedId] of feedIds.entries()) {
          const subscription = draft.data[feedId]
          if (!subscription) continue
          if (!current[index]) continue

          subscription.view = current[index].view
          draft.feedIdByView[newView].delete(feedId)
          draft.feedIdByView[current[index].view].add(feedId)

          if (newCategory) {
            const currentCategory = current[index].category
            subscription.category = currentCategory
          }
        }
      })
    })

    tx.persist(() => {
      return SubscriptionService.patchMany({
        feedIds,
        data: {
          view: newView,
          category: newCategory,
        },
      })
    })

    await tx.run()
  }

  async changeListView({ listId, view }: { listId: string; view: FeedViewType }) {
    const current = get().data[listId]
    if (!current) {
      return
    }

    const currentView = current.view
    const newView = view

    const tx = createTransaction(current)
    tx.store(() => {
      immerSet((draft) => {
        if (!draft.data[listId]) {
          return
        }

        draft.data[listId].view = newView
        draft.listIdByView[currentView].delete(listId)
        draft.listIdByView[newView].add(listId)
      })
    })

    tx.request(async () => {
      if (shouldUseLocalSubscriptionMutation()) return
      await api().subscriptions.update({
        view,
        listId,
      })
    })

    tx.rollback((current) => {
      immerSet((draft) => {
        if (!draft.data[listId]) {
          return
        }

        draft.data[listId].view = current.view
        draft.listIdByView[newView].delete(listId)
        draft.listIdByView[currentView].add(listId)
      })
    })

    tx.persist(() => {
      return SubscriptionService.patch(
        storeDbMorph.toSubscriptionSchema({
          ...current,
          view,
        }),
      )
    })

    await tx.run()
  }

  async deleteCategory({ category, view }: { category: string; view: FeedViewType }) {
    const feedIds = getCategoryFeedIds(category, view)

    const tx = createTransaction()
    tx.store(() => {
      immerSet((draft) => {
        for (const feedId of feedIds) {
          const subscription = draft.data[feedId]
          if (!subscription) continue
          subscription.category = null
        }
        draft.categories[view].delete(category)
      })
    })

    tx.request(async () => {
      if (shouldUseLocalSubscriptionMutation()) return
      await api().categories.delete({
        feedIdList: feedIds,
        deleteSubscriptions: false,
      })
    })

    tx.rollback(() => {
      immerSet((draft) => {
        for (const feedId of feedIds) {
          const subscription = draft.data[feedId]
          if (!subscription) continue
          subscription.category = category
        }

        draft.categories[view].add(category)
      })
    })

    tx.persist(() => {
      return SubscriptionService.patchMany({
        feedIds,
        data: {
          category: null,
        },
      })
    })

    await tx.run()
  }

  async changeCategoryView({
    category,
    currentView,
    newView,
  }: {
    category: string
    currentView: FeedViewType
    newView: FeedViewType
  }) {
    const folderFeedIds = getCategoryFeedIds(category, currentView)

    await this.batchUpdateSubscription({
      feedIds: folderFeedIds,
      view: newView,
    })

    invalidateViews(currentView, newView)
  }

  async renameCategory({
    lastCategory,
    newCategory,
    view,
  }: {
    lastCategory: string
    newCategory: string
    view: FeedViewType
  }) {
    const feedIds = getCategoryFeedIds(lastCategory, view)

    const tx = createTransaction()
    tx.store(() => {
      immerSet((draft) => {
        for (const id of feedIds) {
          const subscription = draft.data[id]
          if (!subscription) continue
          subscription.category = newCategory
        }
        draft.categories[view].add(newCategory)
        draft.categories[view].delete(lastCategory)

        const lastCategoryOpenState = draft.categoryOpenStateByView[view][lastCategory]
        if (typeof lastCategoryOpenState === "boolean") {
          draft.categoryOpenStateByView[view][newCategory] = lastCategoryOpenState
          delete draft.categoryOpenStateByView[view][lastCategory]
        }
      })
    })

    tx.request(async () => {
      if (shouldUseLocalSubscriptionMutation()) return
      await api().categories.update({
        feedIdList: feedIds,
        category: newCategory,
      })
    })

    tx.rollback(() => {
      immerSet((draft) => {
        for (const id of feedIds) {
          const subscription = draft.data[id]
          if (!subscription) continue
          const defaultCategory = getDefaultCategory(subscription)
          subscription.category = lastCategory !== defaultCategory ? lastCategory : null
        }
        draft.categories[view].delete(newCategory)
        draft.categories[view].add(lastCategory)

        const lastCategoryOpenState = draft.categoryOpenStateByView[view][newCategory]
        if (typeof lastCategoryOpenState === "boolean") {
          draft.categoryOpenStateByView[view][lastCategory] = lastCategoryOpenState
          delete draft.categoryOpenStateByView[view][newCategory]
        }
      })
    })

    tx.persist(() => {
      return SubscriptionService.patchMany({
        feedIds,
        data: {
          category: newCategory,
        },
      })
    })

    await tx.run()
  }
}

export const subscriptionActions = new SubscriptionActions()
export const subscriptionSyncService = new SubscriptionSyncService()
