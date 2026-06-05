import { beforeEach, describe, expect, it, vi } from "vitest"

import { decodeAgentEntriesCursor, encodeAgentEntriesCursor, isEntryAfterCursor } from "./cursor"
import { AgentApplicationError, selectAgentEntryContent, toIsoString } from "./types"

const {
  getDB,
  patchMany,
  getFeedAll,
  getSubscriptionAll,
  listUnreadCounts,
  recordSync,
  isEntryVisibleForActiveRelations,
} = vi.hoisted(() => ({
  getDB: vi.fn(),
  patchMany: vi.fn(),
  getFeedAll: vi.fn(),
  getSubscriptionAll: vi.fn(),
  listUnreadCounts: vi.fn(),
  recordSync: vi.fn(),
  isEntryVisibleForActiveRelations: vi.fn(() => true),
}))

vi.mock("@suhui/database/services/entry", () => ({
  EntryService: {
    patchMany,
  },
}))

vi.mock("@suhui/database/services/feed", () => ({
  FeedService: {
    getFeedAll,
  },
}))

vi.mock("@suhui/database/services/subscription", () => ({
  SubscriptionService: {
    getSubscriptionAll,
  },
}))

vi.mock("@suhui/database/services/internal/active-visibility", () => ({
  getActiveVisibilityState: vi.fn(async () => ({
    activeFeedIds: new Set(["feed-1", "feed-2"]),
    activeListIds: new Set<string>(),
    activeInboxIds: new Set<string>(),
    sourceIdBySubscriptionId: new Map([
      ["feed/feed-1", "feed-1"],
      ["feed/feed-2", "feed-2"],
    ]),
  })),
  isEntryVisibleForActiveRelations,
}))

vi.mock("~/manager/db", () => ({
  DBManager: {
    getDB,
  },
}))

vi.mock("~/application/unread/service", () => ({
  unreadApplicationService: {
    listUnreadCounts,
  },
}))

vi.mock("~/manager/sync-logger", () => ({
  syncLogger: {
    record: recordSync,
  },
}))

import { agentApplicationService } from "./service"

describe("agent cursor", () => {
  it("round-trips an opaque cursor", () => {
    const cursor = encodeAgentEntriesCursor({
      publishedAt: 1710000000000,
      insertedAt: 1710000001000,
      id: "entry-b",
    })

    expect(cursor).not.toContain("entry-b")
    expect(decodeAgentEntriesCursor(cursor)).toEqual({
      publishedAt: 1710000000000,
      insertedAt: 1710000001000,
      id: "entry-b",
    })
  })

  it("orders entries after a cursor using publishedAt, insertedAt, then id", () => {
    const cursor = { publishedAt: 1000, insertedAt: 900, id: "entry-b" }

    expect(isEntryAfterCursor({ publishedAt: 999, insertedAt: 999, id: "entry-z" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 899, id: "entry-z" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 900, id: "entry-a" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 900, id: "entry-c" }, cursor)).toBe(
      false,
    )
  })

  it.each([
    ["malformed input", "not-json"],
    [
      "missing fields",
      Buffer.from(JSON.stringify({ publishedAt: 1710000000000, id: "entry-b" }), "utf8").toString(
        "base64url",
      ),
    ],
    [
      "non-finite timestamps",
      Buffer.from(
        '{"publishedAt":1e999,"insertedAt":1710000001000,"id":"entry-b"}',
        "utf8",
      ).toString("base64url"),
    ],
    [
      "empty id",
      Buffer.from(
        JSON.stringify({ publishedAt: 1710000000000, insertedAt: 1710000001000, id: "" }),
        "utf8",
      ).toString("base64url"),
    ],
  ])("rejects invalid cursor with %s", (_name, cursor) => {
    expect(() => decodeAgentEntriesCursor(cursor)).toThrow(AgentApplicationError)

    try {
      decodeAgentEntriesCursor(cursor)
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApplicationError)
      expect((error as AgentApplicationError).code).toBe("SUHUI_INVALID_CURSOR")
    }
  })
})

describe("toIsoString", () => {
  it("returns null for out-of-range date values", () => {
    expect(toIsoString(1e100)).toBeNull()
  })
})

describe("selectAgentEntryContent", () => {
  it("prefers readabilityContent, then content, then description", () => {
    expect(
      selectAgentEntryContent({
        readabilityContent: "<article>Readable</article>",
        content: "<p>Raw</p>",
        description: "Summary",
      }),
    ).toEqual({ content: "<article>Readable</article>", contentSource: "readabilityContent" })

    expect(
      selectAgentEntryContent({
        readabilityContent: "",
        content: "<p>Raw</p>",
        description: "Summary",
      }),
    ).toEqual({ content: "<p>Raw</p>", contentSource: "content" })

    expect(
      selectAgentEntryContent({
        readabilityContent: null,
        content: " ",
        description: "Summary",
      }),
    ).toEqual({ content: "Summary", contentSource: "description" })
  })
})

describe("AgentApplicationService", () => {
  const entries = [
    {
      id: "entry-1",
      feedId: "feed-1",
      title: "First entry",
      url: "https://example.com/1",
      author: "Alice",
      publishedAt: 1710000002000,
      insertedAt: 1710000003000,
      read: false,
      description: "First description",
      content: "<p>First content</p>",
      readabilityContent: "<article>First readable</article>",
    },
    {
      id: "entry-2",
      feedId: "feed-2",
      title: null,
      url: null,
      author: null,
      publishedAt: 1710000000000,
      insertedAt: 1710000001000,
      read: true,
      description: null,
      content: null,
      readabilityContent: null,
    },
    {
      id: "entry-3",
      feedId: "feed-2",
      title: "Overflow entry",
      url: null,
      author: null,
      publishedAt: 1709999999000,
      insertedAt: 1710000000000,
      read: true,
      description: "Overflow description",
      content: null,
      readabilityContent: null,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    getDB.mockReturnValue({
      query: {
        entriesTable: {
          findMany: vi.fn().mockResolvedValue(entries),
          findFirst: vi.fn().mockResolvedValue(entries[0]),
        },
      },
    })
    getFeedAll.mockResolvedValue([
      {
        id: "feed-1",
        title: "Feed One",
        url: "https://example.com/rss",
        siteUrl: "https://example.com",
      },
      { id: "feed-2", title: "Feed Two", url: null, siteUrl: null },
    ])
    getSubscriptionAll.mockResolvedValue([
      {
        id: "feed/feed-1",
        type: "feed",
        feedId: "feed-1",
        title: "Custom Feed One",
        category: "News",
      },
      {
        id: "feed/feed-2",
        type: "feed",
        feedId: "feed-2",
        title: null,
        category: null,
      },
    ])
    listUnreadCounts.mockResolvedValue([
      { id: "feed-1", count: 3 },
      { id: "feed-2", count: 0 },
    ])
  })

  it("lists lightweight entries with feed titles, optional summaries, and cursor metadata", async () => {
    const result = await agentApplicationService.listEntries({ limit: 2, withSummary: true })

    expect(result.items).toEqual([
      {
        id: "entry-1",
        feedId: "feed-1",
        feedTitle: "Custom Feed One",
        title: "First entry",
        url: "https://example.com/1",
        author: "Alice",
        publishedAt: 1710000002000,
        publishedAtIso: "2024-03-09T16:00:02.000Z",
        insertedAt: 1710000003000,
        insertedAtIso: "2024-03-09T16:00:03.000Z",
        read: false,
        summary: "First description",
      },
      {
        id: "entry-2",
        feedId: "feed-2",
        feedTitle: "Feed Two",
        title: "(Untitled)",
        url: null,
        author: null,
        publishedAt: 1710000000000,
        publishedAtIso: "2024-03-09T16:00:00.000Z",
        insertedAt: 1710000001000,
        insertedAtIso: "2024-03-09T16:00:01.000Z",
        read: true,
        summary: null,
      },
    ])
    expect(result.page.limit).toBe(2)
    expect(result.page.hasMore).toBe(true)
    expect(result.page.nextCursor).toEqual(expect.any(String))
  })

  it("uses DB-visible rows to fill a page and compute the next cursor", async () => {
    const laterVisibleEntry = {
      ...entries[2],
      id: "entry-4",
      title: "Later visible entry",
      publishedAt: 1709999998000,
      insertedAt: 1709999999000,
    }
    const orderedRows = [entries[0], entries[1], entries[2], laterVisibleEntry]
    const findMany = vi.fn(async ({ limit }: { limit: number }) => orderedRows.slice(0, limit))
    getDB.mockReturnValue({
      query: {
        entriesTable: {
          findMany,
          findFirst: vi.fn().mockResolvedValue(entries[0]),
        },
      },
    })

    const result = await agentApplicationService.listEntries({ limit: 2 })

    expect(result.items.map((item) => item.id)).toEqual(["entry-1", "entry-2"])
    expect(result.page.hasMore).toBe(true)
    const cursorEntry = entries[1]!
    expect(result.page.nextCursor).toEqual(
      encodeAgentEntriesCursor({
        publishedAt: cursorEntry.publishedAt,
        insertedAt: cursorEntry.insertedAt,
        id: cursorEntry.id,
      }),
    )
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }))
  })

  it("does not lose later visible rows when DB visibility filtering removes hidden rows", async () => {
    const hiddenEntries = Array.from({ length: 51 }, (_, index) => ({
      ...entries[0],
      id: `hidden-entry-${index}`,
      publishedAt: 1710000010000 - index * 2,
      insertedAt: 1710000010001 - index * 2,
    }))
    const visibleEntries = [
      {
        ...entries[0],
        id: "late-visible-entry-1",
        publishedAt: 1710000010000 - hiddenEntries.length * 2,
        insertedAt: 1710000010001 - hiddenEntries.length * 2,
      },
      {
        ...entries[1],
        id: "late-visible-entry-2",
        publishedAt: 1710000010000 - (hiddenEntries.length + 1) * 2,
        insertedAt: 1710000010001 - (hiddenEntries.length + 1) * 2,
      },
    ]
    const findMany = vi.fn(async ({ limit }: { limit: number }) => visibleEntries.slice(0, limit))
    getDB.mockReturnValue({
      query: {
        entriesTable: {
          findMany,
          findFirst: vi.fn().mockResolvedValue(entries[0]),
        },
      },
    })

    const result = await agentApplicationService.listEntries({ limit: 2 })

    expect(result.items.map((item) => item.id)).toEqual([
      "late-visible-entry-1",
      "late-visible-entry-2",
    ])
    expect(result.page.hasMore).toBe(false)
    expect(result.page.nextCursor).toBeNull()
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(hiddenEntries).toHaveLength(51)
  })

  it("returns entry detail with selected content source", async () => {
    const result = await agentApplicationService.getEntry("entry-1")

    expect(result).toMatchObject({
      id: "entry-1",
      feedTitle: "Custom Feed One",
      description: "First description",
      content: "<article>First readable</article>",
      contentSource: "readabilityContent",
    })
  })

  it("lists feed metadata with unread counts", async () => {
    const result = await agentApplicationService.listFeeds()

    expect(result).toEqual({
      items: [
        {
          id: "feed-1",
          subscriptionId: "feed/feed-1",
          title: "Custom Feed One",
          url: "https://example.com/rss",
          siteUrl: "https://example.com",
          category: "News",
          unreadCount: 3,
        },
        {
          id: "feed-2",
          subscriptionId: "feed/feed-2",
          title: "Feed Two",
          url: null,
          siteUrl: null,
          category: null,
          unreadCount: 0,
        },
      ],
    })
  })

  it("updates read status with normalized ids and sync log records", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "entry-1" }, { id: "entry-2" }])
    getDB.mockReturnValue({
      query: {
        entriesTable: {
          findMany,
          findFirst: vi.fn().mockResolvedValue(entries[0]),
        },
      },
    })

    const result = await agentApplicationService.updateReadStatus({
      entryIds: [" entry-1 ", "entry-2", "entry-1", ""],
      read: true,
    })

    expect(result).toEqual({ updated: 2, read: true })
    expect(patchMany).toHaveBeenCalledWith({
      entryIds: ["entry-1", "entry-2"],
      entry: { read: true },
    })
    expect(recordSync).toHaveBeenCalledTimes(2)
    expect(recordSync).toHaveBeenNthCalledWith(1, {
      type: "entry.mark_read",
      entityType: "entry",
      entityId: "entry-1",
    })
    expect(recordSync).toHaveBeenNthCalledWith(2, {
      type: "entry.mark_read",
      entityType: "entry",
      entityId: "entry-2",
    })
  })

  it("does not patch or log read status for missing entries", async () => {
    getDB.mockReturnValue({
      query: {
        entriesTable: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(entries[0]),
        },
      },
    })

    const result = await agentApplicationService.updateReadStatus({
      entryIds: ["missing-entry"],
      read: false,
    })

    expect(result).toEqual({ updated: 0, read: false })
    expect(patchMany).not.toHaveBeenCalled()
    expect(recordSync).not.toHaveBeenCalled()
  })

  it("rejects empty entry ids", async () => {
    await expect(
      agentApplicationService.updateReadStatus({ entryIds: [" ", ""], read: false }),
    ).rejects.toMatchObject({
      code: "SUHUI_INVALID_ENTRY_IDS",
      statusCode: 400,
    })
    expect(patchMany).not.toHaveBeenCalled()
    expect(recordSync).not.toHaveBeenCalled()
  })
})
