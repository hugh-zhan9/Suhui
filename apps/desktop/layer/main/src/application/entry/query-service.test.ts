import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { entriesTable } from "@suhui/database/schemas/index"

const { findMany, findFirst, getDB, getActiveVisibilityState, getSubscriptionAll } = vi.hoisted(
  () => ({
    findMany: vi.fn(),
    findFirst: vi.fn(),
    getDB: vi.fn(),
    getActiveVisibilityState: vi.fn(),
    getSubscriptionAll: vi.fn(),
  }),
)

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
    getDB.mockReturnValue({ query: { entriesTable: { findMany, findFirst } } })
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
