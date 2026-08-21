import { DatabaseSync } from "node:sqlite"

import { entriesTable as sqliteEntries } from "@suhui/database/schemas/sqlite"
import { resetRuntimeDbType, setRuntimeDbType } from "@suhui/database/schemas/runtime"
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core"
import { PgDialect } from "drizzle-orm/pg-core"
import { entriesTable as pgEntries } from "@suhui/database/schemas/postgres"
import { afterEach, describe, expect, it } from "vitest"

import { createEntryVisibilityWhere } from "./query-builder"

const visibility = (sources: string[]) =>
  ({
    activeFeedIds: new Set<string>(),
    activeInboxIds: new Set<string>(),
    activeListIds: new Set(sources),
  }) as never

describe("sources 交集谓词的方言差异", () => {
  afterEach(() => resetRuntimeDbType())

  it("postgres 用原生 jsonb 运算符 ?|", () => {
    setRuntimeDbType("postgres")
    const where = createEntryVisibilityWhere(pgEntries as never, visibility(["list-1"]))

    const { sql } = new PgDialect().sqlToQuery(where)
    expect(sql).toContain("?|")
    expect(sql).not.toContain("json_each")
  })

  it("sqlite 展开成 json_each 子查询", () => {
    setRuntimeDbType("sqlite")
    const where = createEntryVisibilityWhere(sqliteEntries as never, visibility(["list-1"]))

    const { sql } = new SQLiteSyncDialect().sqlToQuery(where)
    expect(sql).toContain("json_each")
    expect(sql).not.toContain("?|")
  })

  it("sqlite 生成的谓词在真实引擎上语义正确", () => {
    setRuntimeDbType("sqlite")
    const where = createEntryVisibilityWhere(sqliteEntries as never, visibility(["list-1"]))
    const { sql, params } = new SQLiteSyncDialect().sqlToQuery(where)

    const db = new DatabaseSync(":memory:")
    db.exec(
      "create table entries(id text primary key, feed_id text, inbox_handle text, sources text)",
    )
    db.exec(`insert into entries values
      ('a', 'f1', null, '["list-1"]'),
      ('b', 'f1', null, '["list-2"]'),
      ('c', 'f1', null, '[]'),
      ('d', 'f1', null, null)`)

    const rows = db
      .prepare(`select id from entries where ${sql} order by id`)
      .all(...(params as never[])) as { id: string }[]

    // 只有 sources 里含 list-1 的那条命中
    expect(rows.map((r) => r.id)).toEqual(["a"])
    db.close()
  })

  it("空来源集合退化为 false", () => {
    setRuntimeDbType("sqlite")
    const where = createEntryVisibilityWhere(sqliteEntries as never, visibility([]))

    expect(new SQLiteSyncDialect().sqlToQuery(where).sql).toContain("false")
  })
})
