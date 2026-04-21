import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@suhui/database/services/subscription", () => ({
  SubscriptionService: {
    getSubscriptionAll: vi.fn(),
  },
}))

vi.mock("@suhui/database/services/feed", () => ({
  FeedService: {
    getFeedAll: vi.fn(),
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

import { FeedService } from "@suhui/database/services/feed"
import { InboxService } from "@suhui/database/services/inbox"
import { ListService } from "@suhui/database/services/list"
import { SubscriptionService } from "@suhui/database/services/subscription"

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
})
