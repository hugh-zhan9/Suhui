import { FeedViewType } from "@follow/constants"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { remoteBatchUpdateMock, remoteCategoryDeleteMock, remoteCategoryUpdateMock } = vi.hoisted(() => ({
  remoteBatchUpdateMock: vi.fn(),
  remoteCategoryDeleteMock: vi.fn(),
  remoteCategoryUpdateMock: vi.fn(),
}))

vi.mock("@follow/store/context", () => ({
  api: () => ({
    subscriptions: {
      batchUpdate: remoteBatchUpdateMock,
      update: vi.fn(),
    },
    categories: {
      delete: remoteCategoryDeleteMock,
      update: remoteCategoryUpdateMock,
    },
  }),
}))

vi.mock("@follow/database/services/subscription", () => ({
  SubscriptionService: {
    patchMany: vi.fn().mockResolvedValue(undefined),
    patch: vi.fn().mockResolvedValue(undefined),
    upsertMany: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    getSubscriptionAll: vi.fn().mockResolvedValue([]),
  },
}))

import { subscriptionActions, subscriptionSyncService, useSubscriptionStore } from "@follow/store/subscription/store"

const makeEmptySetMap = () => ({
  [FeedViewType.All]: new Set<string>(),
  [FeedViewType.Articles]: new Set<string>(),
  [FeedViewType.Audios]: new Set<string>(),
  [FeedViewType.Notifications]: new Set<string>(),
  [FeedViewType.Pictures]: new Set<string>(),
  [FeedViewType.SocialMedia]: new Set<string>(),
  [FeedViewType.Videos]: new Set<string>(),
})

const resetSubscriptionStore = () => {
  useSubscriptionStore.setState({
    data: {},
    feedIdByView: makeEmptySetMap(),
    listIdByView: makeEmptySetMap(),
    categories: makeEmptySetMap(),
    subscriptionIdSet: new Set<string>(),
    categoryOpenStateByView: {
      [FeedViewType.All]: {},
      [FeedViewType.Articles]: {},
      [FeedViewType.Audios]: {},
      [FeedViewType.Notifications]: {},
      [FeedViewType.Pictures]: {},
      [FeedViewType.SocialMedia]: {},
      [FeedViewType.Videos]: {},
    },
  })
}

describe("subscription local branches", () => {
  beforeEach(async () => {
    resetSubscriptionStore()

    remoteBatchUpdateMock.mockReset()
    remoteCategoryDeleteMock.mockReset()
    remoteCategoryUpdateMock.mockReset()

    remoteBatchUpdateMock.mockRejectedValue(new Error("should not call remote batchUpdate"))
    remoteCategoryDeleteMock.mockRejectedValue(new Error("should not call remote categories.delete"))
    remoteCategoryUpdateMock.mockRejectedValue(new Error("should not call remote categories.update"))

    ;(globalThis as any).window = { electron: { ipcRenderer: {} } }

    await subscriptionActions.upsertManyInSession([
      {
        feedId: "feed-a",
        listId: null,
        inboxId: null,
        userId: "local_user_id",
        view: FeedViewType.Articles,
        isPrivate: false,
        hideFromTimeline: false,
        title: "Feed A",
        category: "cat-a",
        createdAt: new Date().toISOString(),
        type: "feed",
      },
    ])
  })

  it("本地模式 batchUpdateSubscription 不应请求远端", async () => {
    await expect(
      subscriptionSyncService.batchUpdateSubscription({
        feedIds: ["feed-a"],
        view: FeedViewType.Notifications,
        category: "cat-b",
      }),
    ).resolves.toBeUndefined()

    expect(remoteBatchUpdateMock).not.toHaveBeenCalled()
  })

  it("本地模式 deleteCategory 不应请求远端", async () => {
    await expect(
      subscriptionSyncService.deleteCategory({
        category: "cat-a",
        view: FeedViewType.Articles,
      }),
    ).resolves.toBeUndefined()

    expect(remoteCategoryDeleteMock).not.toHaveBeenCalled()
  })

  it("本地模式 renameCategory 不应请求远端", async () => {
    await expect(
      subscriptionSyncService.renameCategory({
        lastCategory: "cat-a",
        newCategory: "cat-b",
        view: FeedViewType.Articles,
      }),
    ).resolves.toBeUndefined()

    expect(remoteCategoryUpdateMock).not.toHaveBeenCalled()
  })
})
