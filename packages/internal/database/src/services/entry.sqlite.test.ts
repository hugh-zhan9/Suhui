import { DatabaseSync } from "node:sqlite"

import { drizzle } from "drizzle-orm/sqlite-proxy"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { sqliteMigrations } from "../drizzle/sqlite-baseline"
import { resetRuntimeDbType, setRuntimeDbType } from "../schemas/runtime"

/**
 * 真实 SQLite 引擎 + 真实 service 代码的回归测试。
 *
 * 转换到 SQLite 之后标记已读全线报
 * "SQLite3 can only bind numbers, strings, bigints, buffers, and null"：
 * 主进程虽然连的是 sqlite，用的却还是 Postgres 的表对象，`read: true` 被原样绑进去。
 * 这里跑通的是 EntryService → drizzle → sqlite 的完整链路。
 */
const raw = new DatabaseSync(":memory:")

const proxyDb = drizzle(async (sql, params, method) => {
  const stmt = raw.prepare(sql)
  if (method === "run") {
    stmt.run(...(params as never[]))
    return { rows: [] }
  }
  const rows = stmt.all(...(params as never[])) as Record<string, unknown>[]
  const values = rows.map((row) => Object.values(row))
  return { rows: method === "get" ? (values[0] ?? []) : values }
}, {})

vi.mock("../db", () => ({ db: proxyDb }))

const { EntryService } = await import("./entry")

const seed = () => {
  raw.exec("delete from entries")
  raw
    .prepare(
      `insert into entries (id, feed_id, title, url, guid, read, inserted_at, published_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("e1", "f1", "文章一", "https://example.com/1", "g1", null, 1, 1)
}

beforeEach(() => {
  setRuntimeDbType("sqlite")
  seed()
})

afterEach(() => {
  resetRuntimeDbType()
})

describe("EntryService 在真实 SQLite 上", () => {
  it("标记已读写入 1，而不是抛 bind 错误", async () => {
    await EntryService.patchMany({ entry: { read: true }, entryIds: ["e1"] })

    const row = raw.prepare("select read from entries where id = 'e1'").get() as { read: unknown }
    expect(row.read).toBe(1)
  })

  it("标记未读写入 0", async () => {
    await EntryService.patchMany({ entry: { read: true }, entryIds: ["e1"] })
    await EntryService.patchMany({ entry: { read: false }, entryIds: ["e1"] })

    const row = raw.prepare("select read from entries where id = 'e1'").get() as { read: unknown }
    expect(row.read).toBe(0)
  })

  it("JSON 列写入的是文本，能被 json_each 读到", async () => {
    await EntryService.patchMany({ entry: { categories: ["tech", "rss"] }, entryIds: ["e1"] })

    const row = raw.prepare("select categories from entries where id = 'e1'").get() as {
      categories: string
    }
    expect(JSON.parse(row.categories)).toEqual(["tech", "rss"])
  })
})

// 迁移只跑一次，建表后各用例复用
for (const migration of sqliteMigrations) {
  for (const statement of migration.statements) raw.exec(statement)
}
