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
  raw.exec("delete from entries; delete from subscriptions; delete from feeds;")
  raw.exec(`INSERT INTO feeds (id, url) VALUES ('f1', 'https://example.com/feed');
    INSERT INTO subscriptions (id, feed_id, type, user_id, view, is_private, hide_from_timeline, created_at) VALUES ('feed/f1', 'f1', 'feed', 'local', 0, 0, 0, '2026-09-15');`)
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
  it("pages search documents without detail payloads or deleted rows", async () => {
    const insert = raw.prepare(
      "insert into entries (id, guid, feed_id, title, content, source_content, inserted_at, published_at) values (?, 'guid', 'f1', 'Search title', 'Search body', 'Large cached detail', 1, 1)",
    )
    for (let i = 0; i < 205; i++) insert.run(`search-${String(i).padStart(3, "0")}`)
    raw.exec("update entries set deleted_at = 1 where id = 'e1'")
    expect(await EntryService.getSearchCount()).toBe(205)
    const first = await EntryService.getSearchPage()
    expect(first).toHaveLength(200)
    expect(first[0]).toEqual({
      id: "search-000",
      feedId: "f1",
      title: "Search title",
      content: "Search body",
      description: null,
    })
    const second = await EntryService.getSearchPage(first.at(-1)!.id)
    expect(second).toHaveLength(5)
    expect(second[0]!.id).toBe("search-200")
    expect(await EntryService.getSearchPage(second.at(-1)!.id)).toEqual([])
  })

  it("excludes retained articles immediately after unsubscribing and restores them on resubscribe", async () => {
    expect(await EntryService.getSearchCount()).toBe(1)
    raw.exec("UPDATE subscriptions SET deleted_at = 1")
    expect(await EntryService.getSearchCount()).toBe(0)
    expect(await EntryService.getSearchPage()).toEqual([])
    expect(raw.prepare("SELECT count(*) AS count FROM entries").get()).toMatchObject({ count: 1 })
    raw.exec("UPDATE subscriptions SET deleted_at = NULL")
    expect(await EntryService.getSearchPage()).toHaveLength(1)
    raw.exec("UPDATE feeds SET deleted_at = 1")
    expect(await EntryService.getSearchCount()).toBe(0)
  })

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
