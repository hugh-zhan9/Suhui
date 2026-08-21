import { FeedViewType } from "@suhui/constants"
import type { CollectionSchema } from "@suhui/database/schemas/types"
import { SubscriptionService } from "@suhui/database/services/subscription"
import { tracker } from "@suhui/tracker"
import { omit } from "es-toolkit"

import { queryClient } from "../../context"
import {
  markSubscriptionHydrateDirty,
  reconcileHydratedSubscription,
  runWithHydrateSource,
} from "../../hydrate-phases"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { dbStoreMorph } from "../../morph/db-store"
import { buildSubscriptionDbId, storeDbMorph } from "../../morph/store-db"
import { runtimeClient } from "../../runtime"
import { collectionActions, useCollectionStore } from "../collection/store"
import { invalidateEntriesQuery } from "../entry/hooks"
import { entryActions } from "../entry/store"
import { getFeedById } from "../feed/getter"
import { feedActions } from "../feed/store"
import { getListById } from "../list/getters"
import { listActions } from "../list/store"
import { unreadActions } from "../unread/store"
import { getCategoryFeedIds } from "./getter"
import type { SubscriptionForm, SubscriptionModel } from "./types"
import { getDefaultCategory, getSubscriptionDBId, getSubscriptionStoreId } from "./utils"

type FeedId = string
type ListId = string

const createEmptySetMap = () => ({
  [FeedViewType.All]: new Set<string>(),
  [FeedViewType.Articles]: new Set<string>(),
  [FeedViewType.Audios]: new Set<string>(),
  [FeedViewType.Notifications]: new Set<string>(),
  [FeedViewType.Pictures]: new Set<string>(),
  [FeedViewType.SocialMedia]: new Set<string>(),
  [FeedViewType.Videos]: new Set<string>(),
})

const createEmptyCategoryOpenStateByView = () => ({
  [FeedViewType.All]: {},
  [FeedViewType.Articles]: {},
  [FeedViewType.Audios]: {},
  [FeedViewType.Notifications]: {},
  [FeedViewType.Pictures]: {},
  [FeedViewType.SocialMedia]: {},
  [FeedViewType.Videos]: {},
})

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

const defaultState: SubscriptionState = {
  data: {},
  feedIdByView: createEmptySetMap(),
  listIdByView: createEmptySetMap(),
  categories: createEmptySetMap(),
  subscriptionIdSet: new Set(),
  categoryOpenStateByView: createEmptyCategoryOpenStateByView(),
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

class SubscriptionActions implements Hydratable, Resetable {
  async hydrate() {
    const subscriptions = await SubscriptionService.getSubscriptionAll()
    runWithHydrateSource("hydrate_critical", () => {
      this.restoreHydratedSnapshotInSession(
        subscriptions.map((s) => dbStoreMorph.toSubscriptionModel(s)),
      )
    })
  }

  private rebuildDerivedState(draft: SubscriptionState) {
    draft.feedIdByView = createEmptySetMap()
    draft.listIdByView = createEmptySetMap()
    draft.categories = createEmptySetMap()
    draft.subscriptionIdSet = new Set()

    for (const subscription of Object.values(draft.data)) {
      draft.subscriptionIdSet.add(getSubscriptionDBId(subscription))

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
  }

  private hasCoveredFieldChange(current: SubscriptionModel, next: SubscriptionModel) {
    return (
      current.view !== next.view ||
      current.category !== next.category ||
      current.hideFromTimeline !== next.hideFromTimeline ||
      current.isPrivate !== next.isPrivate ||
      current.title !== next.title
    )
  }

  private mergeSubscriptionForHydrate(
    subscription: SubscriptionModel,
    current?: SubscriptionModel,
  ): SubscriptionModel {
    return reconcileHydratedSubscription(subscription, current)
  }

  async upsertManyInSession(
    subscriptions: SubscriptionModel[],
    options?: { source?: "hydrate" | "runtime" | "rollback" },
  ) {
    immerSet((draft) => {
      for (const subscription of subscriptions) {
        const subscriptionStoreId = getSubscriptionStoreId(subscription)
        const current = draft.data[subscriptionStoreId]
        const nextSubscription =
          options?.source === "hydrate"
            ? this.mergeSubscriptionForHydrate(subscription, current)
            : subscription

        if (
          options?.source !== "hydrate" &&
          options?.source !== "rollback" &&
          current &&
          this.hasCoveredFieldChange(current, nextSubscription)
        ) {
          markSubscriptionHydrateDirty(subscriptionStoreId)
        }

        draft.data[subscriptionStoreId] = nextSubscription
      }

      this.rebuildDerivedState(draft)
    })
  }

  replaceManyInSession(subscriptions: SubscriptionModel[]) {
    immerSet((draft) => {
      draft.data = {}
      draft.feedIdByView = createEmptySetMap()
      draft.listIdByView = createEmptySetMap()
      draft.categories = createEmptySetMap()
      draft.subscriptionIdSet = new Set()
    })

    this.upsertManyInSession(subscriptions, { source: "runtime" })
  }

  restoreHydratedSnapshotInSession(subscriptions: SubscriptionModel[]) {
    immerSet((draft) => {
      const currentData = draft.data
      draft.data = {}

      for (const subscription of subscriptions) {
        const subscriptionStoreId = getSubscriptionStoreId(subscription)
        draft.data[subscriptionStoreId] = this.mergeSubscriptionForHydrate(
          subscription,
          currentData[subscriptionStoreId],
        )
      }

      this.rebuildDerivedState(draft)
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
      runWithHydrateSource("user_write", () => {
        this.upsertManyInSession(subscriptions)
      })
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
      immerSet((draft) => {
        Object.assign(draft, omit(defaultState, ["categoryOpenStateByView"]))
        draft.feedIdByView = createEmptySetMap()
        draft.listIdByView = createEmptySetMap()
        draft.categories = createEmptySetMap()
        draft.subscriptionIdSet = new Set()
      })
    })

    tx.persist(() => {
      return SubscriptionService.purgeAllForMaintenance()
    })

    await tx.run()
  }
}

class SubscriptionSyncService {
  async fetch(view?: FeedViewType) {
    const storeData = get().data
    const allSubscriptions = Object.values(storeData)
    const feedStore = (await import("../feed/store")).useFeedStore.getState()
    return runtimeClient.subscriptions.list(view, {
      subscriptions: allSubscriptions,
      feeds: Object.values(feedStore.feeds),
    })
  }

  async edit(subscription: SubscriptionModel) {
    const subscriptionId = getSubscriptionStoreId(subscription)
    const current = get().data[subscriptionId]
    if (!current) {
      return
    }
    const tx = createTransaction(current)

    tx.store(() => {
      runWithHydrateSource("user_write", () => {
        subscriptionActions.upsertManyInSession([subscription], { source: "runtime" })
      })
    })
    tx.rollback((current) => {
      runWithHydrateSource("user_write", () => {
        subscriptionActions.upsertManyInSession([current], { source: "rollback" })
      })
    })
    tx.request(async () => {
      await runtimeClient.subscriptions.update(subscription)
    })

    await tx.run()
    entryActions.rebuildIndexesInSession()
    await queryClient().invalidateQueries({
      queryKey: ["entries"],
    })
    invalidateViews(current.view, subscription.view)
  }

  async subscribe(subscription: SubscriptionForm) {
    const response: any = await runtimeClient.subscriptions.create(subscription)
    const data = response?.data ?? response
    if (!data) {
      throw new Error("Failed to subscribe via runtime service")
    }

    if (data.feed) {
      feedActions.upsertManyInSession([data.feed])
      tracker.subscribe({ feedId: data.feed.id, view: subscription.view })
    }

    // Insert to subscription first so that entry hydration can bind to its view!
    if (data.subscription) {
      subscriptionActions.upsertManyInSession([dbStoreMorph.toSubscriptionModel(data.subscription)])
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
      await runtimeClient.subscriptions.deleteByTargets(payload)
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
      runWithHydrateSource("user_write", () => {
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
    })

    tx.request(async () => {
      await runtimeClient.subscriptions.batchUpdate({
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
      runWithHydrateSource("user_write", () => {
        immerSet((draft) => {
          if (!draft.data[listId]) {
            return
          }

          draft.data[listId].view = newView
          draft.listIdByView[currentView].delete(listId)
          draft.listIdByView[newView].add(listId)
        })
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
      runWithHydrateSource("user_write", () => {
        immerSet((draft) => {
          for (const feedId of feedIds) {
            const subscription = draft.data[feedId]
            if (!subscription) continue
            subscription.category = null
          }
          draft.categories[view].delete(category)
        })
      })
    })

    tx.request(async () => {
      await runtimeClient.subscriptions.batchUpdate({
        feedIds,
        category: null,
        view,
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
      runWithHydrateSource("user_write", () => {
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
    })

    tx.request(async () => {
      await runtimeClient.subscriptions.batchUpdate({
        feedIds,
        category: newCategory,
        view,
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
