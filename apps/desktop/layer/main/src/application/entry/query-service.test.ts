import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { entriesTable } from "@suhui/database/schemas/index"

const {
  findMany,
  findFirst,
  stateFindMany,
  tagFindMany,
  memberFindMany,
  clusterFindMany,
  collectionFindMany,
  queueFindMany,
  noteFindMany,
  highlightFindMany,
  getDB,
  getActiveVisibilityState,
  getSubscriptionAll,
} = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  stateFindMany: vi.fn(),
  tagFindMany: vi.fn(),
  memberFindMany: vi.fn(),
  clusterFindMany: vi.fn(),
  collectionFindMany: vi.fn(),
  queueFindMany: vi.fn(),
  noteFindMany: vi.fn(),
  highlightFindMany: vi.fn(),
  getDB: vi.fn(),
  getActiveVisibilityState: vi.fn(),
  getSubscriptionAll: vi.fn(),
}))

vi.mock("~/manager/db", () => ({
  DBManager: { getDB },
}))

vi.mock("@suhui/database/services/internal/active-visibility", () => ({
  getActiveVisibilityState,
}))

vi.mock("@suhui/database/services/subscription", () => ({
  SubscriptionService: { getSubscriptionAll },
}))

import { decodeEntryCursor, encodeEntryCursor } from "./query-cursor"
import { EntryQueryService } from "./query-service"

const summaryRow = (overrides: Record<string, unknown> = {}) => ({
  id: "entry-a",
  title: "Entry A",
  url: "https://example.com/a",
  description: "Summary A",
  guid: "guid-a",
  author: "Author",
  authorUrl: null,
  authorAvatar: null,
  insertedAt: 100,
  publishedAt: 100,
  media: null,
  categories: ["news"],
  attachments: null,
  language: "en",
  feedId: "feed-1",
  inboxHandle: null,
  read: false,
  sources: [],
  ...overrides,
})

const detailRow = (overrides: Record<string, unknown> = {}) => ({
  ...summaryRow(),
  content: "<p>body</p>",
  readabilityContent: "<article>readable</article>",
  readabilityUpdatedAt: 123,
  deletedAt: null,
  extra: null,
  settings: null,
  ...overrides,
})

const renderWhere = (where: (entries: typeof entriesTable) => unknown) => {
  const sql = where(entriesTable)
  return new PgDialect().sqlToQuery(sql as never).sql
}

describe("entry query cursor", () => {
  it("round-trips a versioned opaque three-field cursor", () => {
    const value = { v: 1 as const, publishedAt: 10, insertedAt: 9, id: "entry-b" }
    const cursor = encodeEntryCursor(value)

    expect(cursor).not.toContain("entry-b")
    expect(decodeEntryCursor(cursor)).toEqual(value)
  })

  it.each([
    "not-base64-json",
    Buffer.from("null", "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ v: 2, publishedAt: 1, insertedAt: 1, id: "a" })).toString(
      "base64url",
    ),
    Buffer.from('{"v":1,"publishedAt":1e999,"insertedAt":1,"id":"a"}').toString("base64url"),
    Buffer.from(JSON.stringify({ v: 1, publishedAt: 1, insertedAt: 1, id: "" })).toString(
      "base64url",
    ),
    `${Buffer.from(JSON.stringify({ v: 1, publishedAt: 1, insertedAt: 1, id: "a" })).toString(
      "base64url",
    )}!`,
  ])("rejects invalid cursor %s", (cursor) => {
    expect(() => decodeEntryCursor(cursor)).toThrowError(
      expect.objectContaining({ code: "SUHUI_INVALID_CURSOR", statusCode: 400 }),
    )
  })
})

describe("EntryQueryService", () => {
  const service = new EntryQueryService()

  beforeEach(() => {
    vi.clearAllMocks()
    getDB.mockReturnValue({
      query: {
        entriesTable: { findMany, findFirst },
        entryUserStateTable: { findMany: stateFindMany },
        entryTagsTable: { findMany: tagFindMany },
        contentClusterMembersTable: { findMany: memberFindMany },
        contentClustersTable: { findMany: clusterFindMany },
        collectionsTable: { findMany: collectionFindMany },
        readingQueueTable: { findMany: queueFindMany },
        entryNotesTable: { findMany: noteFindMany },
        entryHighlightsTable: { findMany: highlightFindMany },
      },
    })
    getActiveVisibilityState.mockResolvedValue({
      activeFeedIds: new Set(["feed-1", "feed-2"]),
      activeListIds: new Set(["list-1"]),
      activeInboxIds: new Set(["inbox-1"]),
      sourceIdBySubscriptionId: new Map(),
    })
    getSubscriptionAll.mockResolvedValue([
      {
        id: "feed/feed-1",
        type: "feed",
        feedId: "feed-1",
        view: 1,
        isPrivate: false,
        hideFromTimeline: false,
      },
      {
        id: "feed/feed-2",
        type: "feed",
        feedId: "feed-2",
        view: 2,
        isPrivate: true,
        hideFromTimeline: false,
      },
      {
        id: "list/list-1",
        type: "list",
        listId: "list-1",
        view: 1,
        isPrivate: false,
        hideFromTimeline: false,
      },
      {
        id: "inbox/inbox-1",
        type: "inbox",
        inboxId: "inbox-1",
        view: 1,
        isPrivate: false,
        hideFromTimeline: false,
      },
    ])
    findMany.mockResolvedValue([])
    findFirst.mockResolvedValue(undefined)
    stateFindMany.mockResolvedValue([])
    tagFindMany.mockResolvedValue([])
    memberFindMany.mockResolvedValue([])
    clusterFindMany.mockResolvedValue([])
    collectionFindMany.mockResolvedValue([])
    queueFindMany.mockResolvedValue([])
    noteFindMany.mockResolvedValue([])
    highlightFindMany.mockResolvedValue([])
  })

  it.each([0, 101, 1.5, "abc", Number.NaN])("rejects invalid limit %p", async (limit) => {
    await expect(
      service.list({ scope: { kind: "timeline" }, limit: limit as number }),
    ).rejects.toMatchObject({ code: "SUHUI_INVALID_LIMIT", statusCode: 400 })
  })

  it("defaults to 20 and queries only limit plus one rows", async () => {
    await service.list({ scope: { kind: "timeline" } })

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 21 }))
  })

  it("orders by publishedAt DESC, insertedAt DESC, then same-time id DESC", async () => {
    await service.list({ scope: { kind: "timeline" } })

    const desc = vi.fn((column) => column)
    const orderBy = findMany.mock.calls[0]![0].orderBy
    expect(orderBy(entriesTable, { desc })).toEqual([
      entriesTable.publishedAt,
      entriesTable.insertedAt,
      entriesTable.id,
    ])
    expect(desc.mock.calls.map(([column]) => column)).toEqual([
      entriesTable.publishedAt,
      entriesTable.insertedAt,
      entriesTable.id,
    ])
  })

  it("normalizes feed ids, applies strict cursor ordering, and returns a bounded page", async () => {
    findMany.mockResolvedValue([
      summaryRow({ id: "entry-a" }),
      summaryRow({ id: "entry-z", publishedAt: 99, insertedAt: 99 }),
      summaryRow({ id: "overflow", publishedAt: 98, insertedAt: 98 }),
    ])
    const cursor = encodeEntryCursor({ v: 1, publishedAt: 110, insertedAt: 110, id: "entry-b" })

    const page = await service.list({
      scope: { kind: "feeds", feedIds: [" feed-1 ", "feed-1", "", "feed-2"] },
      limit: 2,
      cursor,
    })

    expect(page.items.map(({ id }) => id)).toEqual(["entry-a", "entry-z"])
    expect(page.page).toEqual({ limit: 2, hasMore: true, nextCursor: expect.any(String) })
    expect(decodeEntryCursor(page.page.nextCursor!)).toEqual({
      v: 1,
      publishedAt: 99,
      insertedAt: 99,
      id: "entry-z",
    })

    const options = findMany.mock.calls[0]![0]
    expect(options.limit).toBe(3)
    expect(renderWhere(options.where)).toContain('"entries"."feed_id" in ($')
    expect(renderWhere(options.where)).toContain('"entries"."id" < $')
  })

  it("returns an empty page without querying for empty feed ids", async () => {
    await expect(
      service.list({ scope: { kind: "feeds", feedIds: [" ", ""] }, limit: 5 }),
    ).resolves.toEqual({
      items: [],
      page: { limit: 5, hasMore: false, nextCursor: null },
    })
    expect(findMany).not.toHaveBeenCalled()
  })

  it("normalizes NULL read to false and excludes all body fields from SQL and DTOs", async () => {
    findMany.mockResolvedValue([summaryRow({ read: null })])

    const page = await service.list({ scope: { kind: "timeline" }, read: false })

    expect(page.items[0]).toMatchObject({ read: false, recordKind: "summary" })
    expect(page.items[0]).not.toHaveProperty("content")
    expect(page.items[0]).not.toHaveProperty("readabilityContent")
    expect(page.items[0]).not.toHaveProperty("readabilityUpdatedAt")
    const options = findMany.mock.calls[0]![0]
    expect(options.columns).toMatchObject({
      content: false,
      readabilityContent: false,
      readabilityUpdatedAt: false,
    })
    expect(renderWhere(options.where)).toContain('"entries"."read" IS NOT TRUE')
  })

  it("hides rule-hidden entries by default and exposes an explicit management escape hatch", async () => {
    await service.list({ scope: { kind: "timeline" } })
    expect(renderWhere(findMany.mock.calls[0]![0].where)).toContain("entry_user_state")

    await service.list({ scope: { kind: "timeline" }, includeHidden: true })
    expect(renderWhere(findMany.mock.calls[1]![0].where)).not.toContain("entry_user_state")
  })

  it("folds duplicate cluster rows while retaining member ids and source count", async () => {
    findMany.mockResolvedValue([
      summaryRow({ id: "entry-a" }),
      summaryRow({ id: "entry-b", feedId: "feed-2" }),
    ])
    memberFindMany
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "cluster-1" },
        { entryId: "entry-b", clusterId: "cluster-1" },
      ])
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "cluster-1" },
        { entryId: "entry-b", clusterId: "cluster-1" },
      ])
    clusterFindMany.mockResolvedValue([{ id: "cluster-1", manualRepresentativeEntryId: "entry-b" }])

    const page = await service.list({ scope: { kind: "timeline" } })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      id: "entry-b",
      cluster: {
        id: "cluster-1",
        sourceCount: 2,
        entryIds: ["entry-a", "entry-b"],
      },
    })
  })

  it.each([
    {
      name: "unread",
      query: { scope: { kind: "timeline" as const }, read: false },
      candidate: detailRow({ id: "entry-b", read: true, feedId: "feed-2" }),
      sql: '"entries"."read" IS NOT TRUE',
    },
    {
      name: "feed scope",
      query: { scope: { kind: "feeds" as const, feedIds: ["feed-1"] } },
      candidate: detailRow({ id: "entry-b", feedId: "feed-2" }),
      sql: '"entries"."feed_id" in',
    },
  ])("keeps $name filters on representative candidates", async ({ query, candidate, sql }) => {
    findMany
      .mockResolvedValueOnce([summaryRow({ id: "entry-a" })])
      .mockResolvedValueOnce([detailRow({ id: "entry-a" }), candidate])
    memberFindMany
      .mockResolvedValueOnce([{ entryId: "entry-a", clusterId: "cluster-1" }])
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "cluster-1" },
        { entryId: "entry-b", clusterId: "cluster-1" },
      ])
    clusterFindMany.mockResolvedValue([{ id: "cluster-1", manualRepresentativeEntryId: null }])

    await service.list(query)

    expect(renderWhere(findMany.mock.calls[1]![0].where)).toContain(sql)
    expect(renderWhere(findMany.mock.calls[1]![0].where)).toContain("entry_user_state")
  })

  it("keeps active visibility on representative candidates", async () => {
    findMany
      .mockResolvedValueOnce([summaryRow({ id: "entry-a" })])
      .mockResolvedValueOnce([detailRow({ id: "entry-a" })])
    memberFindMany
      .mockResolvedValueOnce([{ entryId: "entry-a", clusterId: "cluster-1" }])
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "cluster-1" },
        { entryId: "entry-b", clusterId: "cluster-1" },
      ])
    clusterFindMany.mockResolvedValue([{ id: "cluster-1", manualRepresentativeEntryId: null }])

    await service.list({ scope: { kind: "timeline" } })

    const sql = renderWhere(findMany.mock.calls[1]![0].where)
    expect(sql).toContain('"entries"."feed_id" in')
    expect(sql).toContain('"entries"."id" in')
  })

  it("does not expose singleton derived memberships as duplicate clusters", async () => {
    findMany.mockResolvedValue([summaryRow({ id: "entry-a" })])
    memberFindMany
      .mockResolvedValueOnce([{ entryId: "entry-a", clusterId: "cluster-1" }])
      .mockResolvedValueOnce([{ entryId: "entry-a", clusterId: "cluster-1" }])

    const page = await service.list({ scope: { kind: "timeline" } })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.cluster).toBeUndefined()
  })

  it("fills a page by scanning past folded rows", async () => {
    const rawPages = [
      [
        summaryRow({ id: "entry-a", publishedAt: 300, insertedAt: 300 }),
        summaryRow({ id: "entry-b", feedId: "feed-2", publishedAt: 200, insertedAt: 200 }),
        summaryRow({ id: "entry-c", publishedAt: 100, insertedAt: 100 }),
      ],
      [summaryRow({ id: "entry-c", publishedAt: 100, insertedAt: 100 })],
    ]
    let rawPage = 0
    findMany.mockImplementation(async (options) =>
      options.columns?.content === true
        ? [
            detailRow({ id: "entry-a", publishedAt: 300, insertedAt: 300 }),
            detailRow({ id: "entry-b", feedId: "feed-2", publishedAt: 200, insertedAt: 200 }),
          ]
        : (rawPages[rawPage++] ?? []),
    )
    memberFindMany
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "cluster-1" },
        { entryId: "entry-b", clusterId: "cluster-1" },
      ])
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "cluster-1" },
        { entryId: "entry-b", clusterId: "cluster-1" },
      ])
      .mockResolvedValueOnce([])
    clusterFindMany.mockResolvedValue([{ id: "cluster-1", manualRepresentativeEntryId: null }])

    const page = await service.list({ scope: { kind: "timeline" }, limit: 2 })

    expect(page.items.map((item) => item.id)).toEqual(["entry-b", "entry-c"])
    expect(page.page).toEqual({ limit: 2, hasMore: false, nextCursor: null })
  })

  it("returns the later representative instead of an empty intermediary page", async () => {
    const rawPages = [
      [
        summaryRow({ id: "entry-a", publishedAt: 300, insertedAt: 300 }),
        summaryRow({ id: "entry-b", feedId: "feed-2", publishedAt: 200, insertedAt: 200 }),
      ],
      [
        summaryRow({ id: "entry-b", feedId: "feed-2", publishedAt: 200, insertedAt: 200 }),
        summaryRow({ id: "entry-c", publishedAt: 100, insertedAt: 100 }),
      ],
    ]
    let rawPage = 0
    findMany.mockImplementation(async (options) =>
      options.columns?.content === true
        ? [
            detailRow({ id: "entry-a", publishedAt: 300, insertedAt: 300 }),
            detailRow({ id: "entry-b", feedId: "feed-2", publishedAt: 200, insertedAt: 200 }),
          ]
        : (rawPages[rawPage++] ?? []),
    )
    memberFindMany
      .mockResolvedValueOnce([{ entryId: "entry-a", clusterId: "cluster-1" }])
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "cluster-1" },
        { entryId: "entry-b", clusterId: "cluster-1" },
      ])
      .mockResolvedValueOnce([{ entryId: "entry-b", clusterId: "cluster-1" }])
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "cluster-1" },
        { entryId: "entry-b", clusterId: "cluster-1" },
      ])
    clusterFindMany.mockResolvedValue([{ id: "cluster-1", manualRepresentativeEntryId: null }])

    const page = await service.list({ scope: { kind: "timeline" }, limit: 1 })

    expect(page.items.map((item) => item.id)).toEqual(["entry-b"])
    expect(page.page.hasMore).toBe(true)
    expect(decodeEntryCursor(page.page.nextCursor!)).toEqual({
      v: 1,
      publishedAt: 200,
      insertedAt: 200,
      id: "entry-b",
    })
  })

  it("chooses an invested automatic representative before a fuller uninvested copy", async () => {
    findMany
      .mockResolvedValueOnce([
        summaryRow({ id: "entry-a" }),
        summaryRow({ id: "entry-b", feedId: "feed-2" }),
      ])
      .mockResolvedValueOnce([
        detailRow({ id: "entry-a", content: "short" }),
        detailRow({ id: "entry-b", feedId: "feed-2", content: "a much fuller article body" }),
      ])
    memberFindMany
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "cluster-1" },
        { entryId: "entry-b", clusterId: "cluster-1" },
      ])
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "cluster-1" },
        { entryId: "entry-b", clusterId: "cluster-1" },
      ])
    clusterFindMany.mockResolvedValue([{ id: "cluster-1", manualRepresentativeEntryId: null }])
    noteFindMany.mockResolvedValue([{ id: "note-1", entryId: "entry-a" }])

    const page = await service.list({ scope: { kind: "timeline" } })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      id: "entry-a",
      cluster: { representativeEntryId: "entry-a", sourceCount: 2 },
    })
  })

  it.each([
    [{ kind: "timeline", view: 1, excludePrivate: true }, '"entries"."feed_id" in ($'],
    [{ kind: "list", listId: "list-1" }, '"entries"."sources"'],
    [{ kind: "inbox", inboxId: "inbox-1" }, '"entries"."inbox_handle" = $'],
    [{ kind: "collection", view: 1 }, 'from "collections"'],
  ] as const)("applies scope %o in SQL", async (scope, fragment) => {
    await service.list({ scope })

    expect(renderWhere(findMany.mock.calls[0]![0].where).toLowerCase()).toContain(
      fragment.toLowerCase(),
    )
  })

  it("keeps collection subquery columns on their explicit alias", async () => {
    await service.list({ scope: { kind: "collection", view: 1 } })

    const whereSql = renderWhere(findMany.mock.calls[0]![0].where)
    expect(whereSql).toContain('from "collections" "entry_collections"')
    expect(whereSql).toContain('"entry_collections"."entry_id" = "entries"."id"')
    expect(whereSql).toContain('"entry_collections"."view" = $')
    expect(whereSql).not.toContain('"entries"."entry_id"')
  })

  it("returns a last page without a cursor", async () => {
    findMany.mockResolvedValue([summaryRow()])

    await expect(service.list({ scope: { kind: "timeline" }, limit: 2 })).resolves.toMatchObject({
      page: { limit: 2, hasMore: false, nextCursor: null },
    })
  })

  it("keeps a concurrent newer insertion out of an older next-page query", async () => {
    findMany.mockResolvedValue([summaryRow({ id: "older", publishedAt: 99, insertedAt: 99 })])

    const cursor = encodeEntryCursor({ v: 1, publishedAt: 100, insertedAt: 100, id: "page-end" })
    const page = await service.list({ scope: { kind: "timeline" }, cursor })

    expect(page.items.map(({ id }) => id)).toEqual(["older"])
    const whereSql = renderWhere(findMany.mock.calls[0]![0].where)
    expect(whereSql).toContain('"entries"."published_at" < $')
    expect(whereSql).toContain('"entries"."published_at" = $')
    expect(whereSql).toContain('"entries"."inserted_at" < $')
    expect(whereSql).toContain('"entries"."id" < $')
  })

  it.each([null, 0, 1, "false", Number.NaN])("rejects invalid read filter %p", async (read) => {
    await expect(
      service.list({ scope: { kind: "timeline" }, read: read as unknown as boolean }),
    ).rejects.toMatchObject({ code: "SUHUI_INVALID_READ_FILTER", statusCode: 400 })
  })

  it.each([
    { kind: "timeline", view: "1" },
    { kind: "timeline", view: Number.NaN },
    { kind: "timeline", view: Number.POSITIVE_INFINITY },
    { kind: "timeline", view: 1.5 },
    { kind: "timeline", excludePrivate: "true" },
    { kind: "timeline", excludePrivate: 1 },
    { kind: "collection", view: "1" },
    { kind: "collection", view: Number.NaN },
    { kind: "collection", view: Number.NEGATIVE_INFINITY },
    { kind: "collection", view: 1.5 },
  ])("rejects invalid scope fields in %o", async (scope) => {
    await expect(service.list({ scope: scope as never })).rejects.toMatchObject({
      code: "SUHUI_INVALID_ENTRY_SCOPE",
      statusCode: 400,
    })
  })

  it("keeps desktop non-deleted detail while active-relations rejects inactive detail", async () => {
    findFirst
      .mockResolvedValueOnce(detailRow({ id: "pending-entry" }))
      .mockResolvedValueOnce(undefined)

    await expect(service.getDetail("pending-entry", "desktop-non-deleted")).resolves.toMatchObject({
      id: "pending-entry",
      recordKind: "detail",
    })
    await expect(service.getDetail("pending-entry", "active-relations")).resolves.toBeNull()

    const desktopWhere = findFirst.mock.calls[0]![0].where
    const activeWhere = findFirst.mock.calls[1]![0].where
    expect(renderWhere(desktopWhere)).not.toContain('"entries"."sources"')
    expect(renderWhere(activeWhere)).toContain('"entries"."sources"')
  })

  it("marks legal empty content as a loaded detail", async () => {
    findFirst.mockResolvedValue(detailRow({ content: null, readabilityContent: null }))

    await expect(service.getDetail("empty-entry", "desktop-non-deleted")).resolves.toMatchObject({
      recordKind: "detail",
      content: null,
      readabilityContent: null,
    })
  })
})
