import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("~/manager/db", () => ({
  DBManager: {
    getDB: vi.fn(),
  },
}))

import { DBManager } from "~/manager/db"

import { unreadApplicationService } from "./service"

describe("UnreadApplicationService", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("normalizes legacy unread rows keyed by subscription id into feed ids", async () => {
    vi.mocked(DBManager.getDB).mockReturnValue({
      query: {
        unreadTable: {
          findMany: vi.fn().mockResolvedValue([
            { id: "feed/feed-1", count: 3 },
            { id: "feed-2", count: 2 },
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
          findMany: vi.fn().mockResolvedValue([
            { feedId: "feed-1", inboxHandle: null },
            { feedId: "feed-1", inboxHandle: null },
            { feedId: "feed-1", inboxHandle: null },
            { feedId: "feed-2", inboxHandle: null },
            { feedId: "feed-2", inboxHandle: null },
          ]),
        },
      },
    } as any)

    const unreadCounts = await unreadApplicationService.listUnreadCounts()

    expect(unreadCounts).toEqual([
      { id: "feed-1", count: 3 },
      { id: "feed-2", count: 2 },
    ])
  })
})
