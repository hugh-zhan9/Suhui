import { eq, is } from "drizzle-orm"
import { PgTable } from "drizzle-orm/pg-core"
import { SQLiteTable } from "drizzle-orm/sqlite-core"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import { afterEach, describe, expect, it } from "vitest"

import { entriesTable, subscriptionsTable } from "./index"
import { resetRuntimeDbType, setRuntimeDbType } from "./runtime"

/**
 * 回归：主进程跑在 SQLite 上却用 Postgres 的表对象时，`read: true` 会被原样绑给
 * better-sqlite3，报 "SQLite3 can only bind numbers, strings, bigints, buffers,
 * and null"——真实转换到 SQLite 后标记已读全线失败。
 */
const sqliteDb = drizzle(async () => ({ rows: [] }), {})

afterEach(() => {
  resetRuntimeDbType()
})

describe("表对象随方言重绑", () => {
  it("缺省是 postgres 的表", () => {
    expect(is(entriesTable, PgTable)).toBe(true)
  })

  it("设为 sqlite 后变成 sqlite 的表", () => {
    setRuntimeDbType("sqlite")
    expect(is(entriesTable, SQLiteTable)).toBe(true)
    expect(is(subscriptionsTable, SQLiteTable)).toBe(true)
  })

  it("切回 postgres 会还原", () => {
    setRuntimeDbType("sqlite")
    setRuntimeDbType("postgres")
    expect(is(entriesTable, PgTable)).toBe(true)
  })

  it("sqlite 下 boolean 绑成 1/0 而不是 true/false", () => {
    setRuntimeDbType("sqlite")

    const marked = sqliteDb
      .update(entriesTable)
      .set({ read: true })
      .where(eq(entriesTable.id, "e1"))
      .toSQL()
    expect(marked.params).toEqual([1, "e1"])

    const unmarked = sqliteDb
      .update(entriesTable)
      .set({ read: false })
      .where(eq(entriesTable.id, "e1"))
      .toSQL()
    expect(unmarked.params).toEqual([0, "e1"])
  })

  it("sqlite 下 JSON 列绑成文本", () => {
    setRuntimeDbType("sqlite")

    const query = sqliteDb
      .update(entriesTable)
      .set({ categories: ["tech", "rss"] })
      .where(eq(entriesTable.id, "e1"))
      .toSQL()
    expect(query.params).toEqual(['["tech","rss"]', "e1"])
  })

  it("sqlite 下订阅的 boolean 同样被转换", () => {
    setRuntimeDbType("sqlite")

    const query = sqliteDb
      .update(subscriptionsTable)
      .set({ isPrivate: true, hideFromTimeline: false })
      .where(eq(subscriptionsTable.id, "s1"))
      .toSQL()
    expect(query.params).toEqual([1, 0, "s1"])
  })
})
