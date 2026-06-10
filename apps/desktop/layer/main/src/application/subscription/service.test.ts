import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@suhui/database/services/subscription", () => ({
  SubscriptionService: {
    getSubscriptionAll: vi.fn(),
    upsertMany: vi.fn(),
  },
}))

vi.mock("@suhui/database/services/feed", () => ({
  FeedService: {
    getFeedAll: vi.fn(),
    upsertMany: vi.fn(),
  },
}))

vi.mock("@suhui/database/services/entry", () => ({
  EntryService: {
    upsertMany: vi.fn(),
  },
}))

vi.mock("@suhui/database/services/list", () => ({
  ListService: {
    getListAll: vi.fn(),
  },
}))

vi.mock("@suhui/database/services/inbox", () => ({
  InboxService: {
    getInboxAll: vi.fn(),
  },
}))

vi.mock("~/manager/db", () => ({
  DBManager: {
    getDB: vi.fn(),
  },
}))

vi.mock("~/manager/feed-refresh", () => ({
  FeedRefreshService: {
    buildPreviewData: vi.fn(),
  },
}))

vi.mock("~/manager/sync-logger", () => ({
  syncLogger: {
    record: vi.fn(),
  },
}))

import { FeedService } from "@suhui/database/services/feed"
import { EntryService } from "@suhui/database/services/entry"
import { InboxService } from "@suhui/database/services/inbox"
import { ListService } from "@suhui/database/services/list"
import { SubscriptionService } from "@suhui/database/services/subscription"

import { DBManager } from "~/manager/db"
import { FeedRefreshService } from "~/manager/feed-refresh"

import { subscriptionApplicationService } from "./service"

describe("SubscriptionApplicationService", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(FeedService.getFeedAll).mockResolvedValue([])
    vi.mocked(ListService.getListAll).mockResolvedValue([])
    vi.mocked(InboxService.getInboxAll).mockResolvedValue([])
  })

  it("falls back to feed title when subscription title is missing", async () => {
    vi.mocked(SubscriptionService.getSubscriptionAll).mockResolvedValue([
      {
        id: "feed/feed-1",
        type: "feed",
        feedId: "feed-1",
        listId: null,
        inboxId: null,
        userId: "local-user",
        view: 0,
        isPrivate: false,
        hideFromTimeline: false,
        title: null,
        category: null,
        createdAt: new Date().toISOString(),
        deletedAt: null,
      },
    ])
    vi.mocked(FeedService.getFeedAll).mockResolvedValue([
      {
        id: "feed-1",
        title: "Recovered Feed Title",
        url: "https://example.com/feed.xml",
        description: null,
        image: null,
        errorAt: null,
        siteUrl: null,
        ownerUserId: null,
        errorMessage: null,
        subscriptionCount: null,
        updatesPerWeek: null,
        latestEntryPublishedAt: null,
        tipUserIds: null,
        updatedAt: null,
        deletedAt: null,
      },
    ])

    const subscriptions = await subscriptionApplicationService.listSubscriptions()

    expect(subscriptions[0]?.title).toBe("Recovered Feed Title")
  })

  it("persists newly added feed timestamps as numeric milliseconds", async () => {
    vi.mocked(DBManager.getDB).mockReturnValue({
      query: {
        feedsTable: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    } as any)
    vi.mocked(FeedRefreshService.buildPreviewData).mockResolvedValue({
      feed: {
        type: "feed",
        id: "local_feed_1",
        url: "https://www.gugegt.com/feed/",
        title: "如果我闻，众妙之门",
        description: null,
        image: null,
        siteUrl: "https://www.gugegt.com/",
        errorAt: null,
        ownerUserId: null,
        errorMessage: null,
        subscriptionCount: null,
        updatesPerWeek: null,
        latestEntryPublishedAt: null,
        tipUserIds: null,
        updatedAt: 1779980720051,
      },
      entries: [],
      subscription: undefined,
      analytics: {
        updatesPerWeek: null,
        subscriptionCount: null,
        latestEntryPublishedAt: null,
        view: 1,
      },
    })

    await subscriptionApplicationService.createSubscription({
      url: "https://www.gugegt.com/feed/",
      view: 1,
    })

    expect(FeedService.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "local_feed_1",
        updatedAt: 1779980720051,
      }),
    ])
    expect(EntryService.upsertMany).toHaveBeenCalledWith([])
    expect(SubscriptionService.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "feed/local_feed_1",
        feedId: "local_feed_1",
      }),
    ])
  })

  it("serializes concurrent creates for the same feed URL", async () => {
    const storedFeeds: any[] = []
    const storedSubscriptions: any[] = []
    let previewIndex = 0

    vi.mocked(DBManager.getDB).mockReturnValue({
      query: {
        feedsTable: {
          findMany: vi.fn(async () =>
            storedFeeds.map((feed) => ({
              id: feed.id,
              url: feed.url,
              siteUrl: feed.siteUrl,
            })),
          ),
          findFirst: vi.fn(async () => storedFeeds[0] ?? null),
        },
        subscriptionsTable: {
          findFirst: vi.fn(async () => storedSubscriptions[0] ?? null),
        },
        entriesTable: {
          findMany: vi.fn(async () => []),
        },
      },
    } as any)

    vi.mocked(FeedService.upsertMany).mockImplementation(async (feeds: any[]) => {
      storedFeeds.push(...feeds)
    })
    vi.mocked(SubscriptionService.upsertMany).mockImplementation(async (subscriptions: any[]) => {
      storedSubscriptions.push(...subscriptions)
    })
    vi.mocked(EntryService.upsertMany).mockResolvedValue(undefined)
    vi.mocked(FeedRefreshService.buildPreviewData).mockImplementation(async () => {
      previewIndex += 1
      return {
        feed: {
          type: "feed",
          id: `local_feed_${previewIndex}`,
          url: "https://blog.yasking.org/rss.xml",
          title: "Yasking",
          description: null,
          image: null,
          siteUrl: "https://blog.yasking.org",
          errorAt: null,
          ownerUserId: null,
          errorMessage: null,
          subscriptionCount: null,
          updatesPerWeek: null,
          latestEntryPublishedAt: null,
          tipUserIds: null,
          updatedAt: 1779980720051,
        },
        entries: [],
        subscription: undefined,
        analytics: {
          updatesPerWeek: null,
          subscriptionCount: null,
          latestEntryPublishedAt: null,
          view: 1,
        },
      }
    })

    const [first, second] = await Promise.all([
      subscriptionApplicationService.createSubscription({
        url: "https://blog.yasking.org/rss.xml",
        view: 1,
      }),
      subscriptionApplicationService.createSubscription({
        url: "https://blog.yasking.org/rss.xml",
        view: 1,
      }),
    ])

    expect(FeedRefreshService.buildPreviewData).toHaveBeenCalledTimes(1)
    expect(FeedService.upsertMany).toHaveBeenCalledTimes(1)
    expect(SubscriptionService.upsertMany).toHaveBeenCalledTimes(1)
    expect(second.subscription.feedId).toBe(first.subscription.feedId)
  })
})
