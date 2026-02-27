import { FeedViewType } from "@follow/constants"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { deleteByTargetsMock } = vi.hoisted(() => ({
  deleteByTargetsMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@follow/database/services/subscription", () => ({
  SubscriptionService: {
    deleteByTargets: deleteByTargetsMock,
    delete: vi.fn().mockResolvedValue(undefined),
    patchMany: vi.fn().mockResolvedValue(undefined),
    patch: vi.fn().mockResolvedValue(undefined),
    upsertMany: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    getSubscriptionAll: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("@follow/store/context", () => ({
  api: () => ({
    subscriptions: {
      update: vi.fn(),
      batchUpdate: vi.fn(),
    },
    categories: {
      delete: vi.fn(),
      update: vi.fn(),
    },
  }),
  queryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
}))

import { subscriptionActions, subscriptionSyncService, useSubscriptionStore } from "@follow/store/subscription/store"
import { useEntryStore } from "@follow/store/entry/store"

const setMap = () => ({
  [FeedViewType.All]: new Set<string>(),
  [FeedViewType.Articles]: new Set<string>(),
  [FeedViewType.Audios]: new Set<string>(),
  [FeedViewType.Notifications]: new Set<string>(),
  [FeedViewType.Pictures]: new Set<string>(),
  [FeedViewType.SocialMedia]: new Set<string>(),
  [FeedViewType.Videos]: new Set<string>(),
})

describe("subscription unsubscribe local delete", () => {
  beforeEach(async () => {
    deleteByTargetsMock.mockClear()
    useSubscriptionStore.setState({
      data: {},
      feedIdByView: setMap(),
      listIdByView: setMap(),
      categories: setMap(),
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

    useEntryStore.setState({
      data: {
        "entry-feed-a-1": {
          id: "entry-feed-a-1",
          feedId: "feed-a",
          inboxHandle: null,
          title: "Entry A1",
          url: "https://example.com/a1",
          content: null,
          readabilityContent: null,
          readabilityUpdatedAt: null,
          description: null,
          guid: null,
          author: null,
          authorUrl: null,
          authorAvatar: null,
          insertedAt: new Date(),
          publishedAt: new Date(),
          media: null,
          categories: null,
          attachments: null,
          extra: null,
          language: null,
          read: false,
          sources: null,
          settings: null,
        } as any,
      },
      entryIdByView: {
        [FeedViewType.All]: new Set<string>(["entry-feed-a-1"]),
        [FeedViewType.Articles]: new Set<string>(["entry-feed-a-1"]),
        [FeedViewType.Audios]: new Set<string>(),
        [FeedViewType.Notifications]: new Set<string>(),
        [FeedViewType.Pictures]: new Set<string>(),
        [FeedViewType.SocialMedia]: new Set<string>(),
        [FeedViewType.Videos]: new Set<string>(),
      },
      entryIdByCategory: { "cat-a": new Set<string>(["entry-feed-a-1"]) },
      entryIdByFeed: { "feed-a": new Set<string>(["entry-feed-a-1"]) },
      entryIdByInbox: {},
      entryIdByList: {},
      entryIdSet: new Set<string>(["entry-feed-a-1"]),
    })
  })

  it("取消订阅时应按 feedId 维度做本地数据库删除", async () => {
    await subscriptionSyncService.unsubscribe("feed-a")

    expect(deleteByTargetsMock).toHaveBeenCalledTimes(1)
    expect(deleteByTargetsMock).toHaveBeenCalledWith({
      ids: ["feed/feed-a"],
      feedIds: ["feed-a"],
      listIds: [],
      inboxIds: [],
    })
    expect(useEntryStore.getState().entryIdByView[FeedViewType.All].has("entry-feed-a-1")).toBe(
      false,
    )
  })
})
