import { beforeEach, describe, expect, it, vi } from "vitest"

const { getDB } = vi.hoisted(() => ({
  getDB: vi.fn(),
}))

vi.mock("~/manager/db", () => ({
  DBManager: {
    getDB,
  },
}))

vi.mock("@suhui/database/services/internal/active-visibility", () => ({
  getActiveVisibilityState: vi.fn(async () => ({
    activeFeedIds: new Set(["feed-1"]),
    activeListIds: new Set<string>(),
    activeInboxIds: new Set<string>(),
    sourceIdBySubscriptionId: new Map([["feed/feed-1", "feed-1"]]),
  })),
}))

import { unreadApplicationService } from "./service"

describe("UnreadApplicationService", () => {
  beforeEach(() => {
    getDB.mockReset()
    getDB.mockReturnValue({
      query: {
        unreadTable: {
          findMany: vi.fn().mockResolvedValue([
            { id: "feed/feed-1", count: 2 },
            { id: "feed/deleted-feed", count: 999 },
          ]),
        },
        subscriptionsTable: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "feed/feed-1",
              type: "feed",
              feedId: "feed-1",
              listId: null,
              inboxId: null,
            },
          ]),
        },
        entriesTable: {
          findMany: vi.fn().mockResolvedValue([{ feedId: "feed-1", inboxHandle: null }]),
        },
      },
    })
  })

  it("drops orphan unread rows that no longer belong to an active subscription", async () => {
    await expect(unreadApplicationService.listUnreadCounts()).resolves.toEqual([
      { id: "feed-1", count: 1 },
    ])
  })
})
