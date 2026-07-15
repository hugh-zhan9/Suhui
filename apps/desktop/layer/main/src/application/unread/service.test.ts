import { entriesTable, unreadTable } from "@suhui/database/schemas/index"
import { drizzle } from "drizzle-orm/node-postgres"
import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { unreadApplicationService } from "./service"

const { entriesFindMany, getDB, queryRows, queryStates } = vi.hoisted(() => ({
  entriesFindMany: vi.fn(),
  getDB: vi.fn(),
  queryRows: {
    legacy: [] as Array<{ id: string; count: number }>,
    derived: [] as Array<{ id: string; count: number }>,
  },
  queryStates: [] as Array<{
    selection: Record<string, unknown>
    from?: unknown
    join?: unknown
    where?: unknown
    groupBy: unknown[]
  }>,
}))

vi.mock("~/manager/db", () => ({
  DBManager: {
    getDB,
  },
}))

const renderQuery = (value: unknown) => new PgDialect().sqlToQuery(value as never)
const renderSql = (value: unknown) => renderQuery(value).sql

describe("UnreadApplicationService", () => {
  beforeEach(() => {
    entriesFindMany.mockReset()
    queryRows.legacy = [{ id: "feed-1", count: 2 }]
    queryRows.derived = [{ id: "feed-1", count: 3 }]
    queryStates.length = 0
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
          findMany: entriesFindMany.mockResolvedValue([{ feedId: "feed-1", inboxHandle: null }]),
        },
      },
      select: vi.fn((selection: Record<string, unknown>) => {
        const state: (typeof queryStates)[number] = { selection, groupBy: [] }
        queryStates.push(state)
        const builder = {
          from(table: unknown) {
            state.from = table
            return builder
          },
          innerJoin(_table: unknown, on: unknown) {
            state.join = on
            return builder
          },
          where(where: unknown) {
            state.where = where
            return builder
          },
          groupBy(...columns: unknown[]) {
            state.groupBy = columns
            return Promise.resolve(
              state.from === unreadTable ? queryRows.legacy : queryRows.derived,
            )
          },
        }
        return builder
      }),
    })
  })

  it("groups active unread entries in SQL and treats NULL as unread", async () => {
    await expect(unreadApplicationService.listUnreadCounts()).resolves.toEqual([
      { id: "feed-1", count: 3 },
    ])

    expect(entriesFindMany).not.toHaveBeenCalled()
    const entryQuery = queryStates.find((query) => query.from === entriesTable)
    expect(entryQuery).toBeDefined()
    expect(Object.keys(entryQuery!.selection)).toEqual(["id", "count"])

    const executedSql = [
      renderSql(entryQuery!.where),
      `GROUP BY ${entryQuery!.groupBy.map(renderSql).join(", ")}`,
    ]
      .join(" ")
      .toUpperCase()
    expect(executedSql).toContain("IS NOT TRUE")
    expect(executedSql).toContain("GROUP BY")
    expect(executedSql).toContain("EXISTS")
    expect(executedSql).toContain('"SUBSCRIPTIONS"."DELETED_AT" IS NULL')
    expect(executedSql).toContain('"ENTRIES"."DELETED_AT" IS NULL')
  })

  it("normalizes legacy feed, list, and inbox sources when other source columns overlap", async () => {
    queryRows.legacy = [
      { id: "feed-from-type", count: 2 },
      { id: "list-from-type", count: 4 },
      { id: "inbox-from-type", count: 5 },
    ]
    queryRows.derived = [{ id: "feed-from-type", count: 3 }]

    await expect(unreadApplicationService.listUnreadCounts()).resolves.toEqual([
      { id: "feed-from-type", count: 3 },
      { id: "list-from-type", count: 4 },
      { id: "inbox-from-type", count: 5 },
    ])

    const legacyQuery = queryStates.find((query) => query.from === unreadTable)
    expect(legacyQuery).toBeDefined()
    expect(Object.keys(legacyQuery!.selection)).toEqual(["id", "count"])
    const sourceIdQuery = renderQuery(legacyQuery!.selection.id)
    const sourceIdSql = sourceIdQuery.sql.toUpperCase()
    expect(sourceIdSql).toContain('CASE "SUBSCRIPTIONS"."TYPE"')
    expect(sourceIdSql).toContain('THEN "SUBSCRIPTIONS"."FEED_ID"')
    expect(sourceIdSql).toContain('THEN "SUBSCRIPTIONS"."LIST_ID"')
    expect(sourceIdSql).toContain('ELSE "SUBSCRIPTIONS"."INBOX_ID"')
    expect(sourceIdSql).not.toContain("COALESCE")
    expect(sourceIdQuery.params).toEqual([])
    expect(renderSql(legacyQuery!.join).toUpperCase()).toContain(
      '"SUBSCRIPTIONS"."DELETED_AT" IS NULL',
    )
    expect(legacyQuery!.groupBy).toHaveLength(1)
  })

  it("compiles one PostgreSQL-valid legacy grouping expression without type placeholders", async () => {
    const pgQuery = vi.fn((query: { text: string }, _params?: unknown[]) =>
      Promise.resolve({
        rows: query.text.includes('from "unread"') ? [["legacy-feed", 2]] : [["derived-feed", 3]],
      }),
    )
    getDB.mockReturnValue(drizzle({ client: { query: pgQuery } as never }))

    await unreadApplicationService.listUnreadCounts()

    const legacyCall = pgQuery.mock.calls.find(([query]) => query.text.includes('from "unread"'))
    expect(legacyCall).toBeDefined()
    const [query, params] = legacyCall!
    const compiledSql = query.text.replace(/\s+/g, " ").trim()
    const sourceExpression =
      `CASE "subscriptions"."type" ` +
      `WHEN 'feed' THEN "subscriptions"."feed_id" ` +
      `WHEN 'list' THEN "subscriptions"."list_id" ` +
      `ELSE "subscriptions"."inbox_id" END`

    expect(compiledSql).toContain(`select ${sourceExpression}, SUM("unread"."count")`)
    expect(compiledSql).toContain(`where ${sourceExpression} IS NOT NULL`)
    expect(compiledSql).toContain(`group by ${sourceExpression}`)
    expect(params).toEqual([])
  })
})
