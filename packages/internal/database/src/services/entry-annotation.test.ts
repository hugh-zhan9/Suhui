import { DatabaseSync } from "node:sqlite"

import type { AnnotationLibraryItem, AnnotationLibraryQuery } from "@suhui/shared/annotations"
import { drizzle as postgresDrizzle } from "drizzle-orm/pg-proxy"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { sqliteMigrations } from "../drizzle/sqlite-baseline"
import { resetRuntimeDbType, setRuntimeDbType } from "../schemas/runtime"

const database = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("../db", () => ({
  get db() {
    return database.current
  },
}))

const { EntryAnnotationService } = await import("./entry-annotation")
const raw = new DatabaseSync(":memory:")
for (const migration of sqliteMigrations) {
  for (const statement of migration.statements) raw.exec(statement)
}
const sqliteDb = drizzle(async (query, params) => {
  const statement = raw.prepare(query)
  statement.setReturnArrays(true)
  return { rows: statement.all(...(params as never[])) as unknown[][] }
})

const note = (id: string, updatedAt: number, entryId = "e1", deletedAt: number | null = null) => {
  raw
    .prepare(
      "INSERT INTO entry_notes (id, entry_id, content, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, entryId, `笔记 ${id}`, updatedAt, updatedAt, deletedAt)
}
const highlight = (
  id: string,
  updatedAt: number,
  status = "active",
  deletedAt: number | null = null,
) => {
  raw
    .prepare(
      "INSERT INTO entry_highlights (id, entry_id, source, quote, status, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, "e2", "readability", `摘录 ${id}`, status, updatedAt, updatedAt, deletedAt)
}

beforeEach(() => {
  setRuntimeDbType("sqlite")
  database.current = sqliteDb
  raw.exec(
    "DELETE FROM entry_notes; DELETE FROM entry_highlights; DELETE FROM entries; DELETE FROM feeds;",
  )
  raw.exec("INSERT INTO feeds (id, title, url) VALUES ('f1', '订阅源', 'https://example.com/feed')")
  raw.exec(
    "INSERT INTO entries (id, title, feed_id, guid, inserted_at, published_at) VALUES ('e1', '文章一', 'f1', 'g1', 1, 1), ('e2', '文章二', 'f1', 'g2', 2, 2)",
  )
})
afterEach(() => resetRuntimeDbType())
afterAll(() => raw.close())

describe("annotation library", () => {
  it("returns an empty terminal page", async () => {
    expect(await EntryAnnotationService.listLibrary()).toEqual({ items: [], nextCursor: null })
  })

  it("combines notes and orphaned highlights with article metadata, excluding deleted annotations", async () => {
    note("n1", 10)
    highlight("h1", 20, "orphaned")
    note("deleted-note", 50, "e1", 51)
    highlight("deleted-highlight", 60, "active", 61)

    const result = await EntryAnnotationService.listLibrary()
    expect(result.nextCursor).toBeNull()
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "h1",
        kind: "highlight",
        content: "摘录 h1",
        updatedAt: 20,
        source: "readability",
        status: "orphaned",
        articleId: "e2",
        articleTitle: "文章二",
        feedTitle: "订阅源",
      }),
      expect.objectContaining({
        id: "n1",
        kind: "note",
        content: "笔记 n1",
        updatedAt: 10,
        source: null,
        status: null,
        articleId: "e1",
        articleTitle: "文章一",
        feedId: "f1",
      }),
    ])
  })

  it("filters before pagination and handles a single item at the limit", async () => {
    note("n1", 1)
    highlight("h1", 3)
    highlight("h2", 2)
    const result = await EntryAnnotationService.listLibrary({ kind: "note", limit: 1 })
    expect(result.items.map((item) => item.id)).toEqual(["n1"])
    expect(result.nextCursor).toBeNull()
    expect(
      (await EntryAnnotationService.listLibrary({ kind: "highlight" })).items.map(
        (item) => item.id,
      ),
    ).toEqual(["h1", "h2"])
  })

  it("pages every item once, including timestamp and cross-table ID ties and a partial final page", async () => {
    for (let index = 0; index < 52; index++) {
      note(`id-${index.toString().padStart(3, "0")}`, 10)
      highlight(`id-${index.toString().padStart(3, "0")}`, 10)
    }
    let cursor: AnnotationLibraryQuery["cursor"]
    const items: AnnotationLibraryItem[] = []
    const sizes: number[] = []
    do {
      const page = await EntryAnnotationService.listLibrary({ cursor, limit: 3 })
      sizes.push(page.items.length)
      items.push(...page.items)
      cursor = page.nextCursor ?? undefined
    } while (cursor && sizes.length < 40)
    expect(items).toHaveLength(104)
    expect(new Set(items.map((item) => `${item.kind}:${item.id}`)).size).toBe(104)
    expect(items.slice(0, 2).map((item) => item.kind)).toEqual(["note", "highlight"])
    expect(sizes.at(-1)).toBe(2)
    expect((await EntryAnnotationService.listLibrary()).items).toHaveLength(50)
  })

  it("does not shift the next page when a newer record is inserted", async () => {
    note("n1", 10)
    note("n2", 20)
    const first = await EntryAnnotationService.listLibrary({ limit: 1 })
    note("n3", 30)
    const second = await EntryAnnotationService.listLibrary({ limit: 1, cursor: first.nextCursor! })
    expect(second.items.map((item) => item.id)).toEqual(["n1"])
    expect(second.nextCursor).toBeNull()
  })

  it("retains records from unavailable articles and removed feeds", async () => {
    note("missing", 1, "missing-entry")
    note("deleted", 2)
    highlight("kept", 3)
    raw.exec("UPDATE entries SET deleted_at = 1 WHERE id = 'e1'; DELETE FROM feeds")
    const { items } = await EntryAnnotationService.listLibrary()
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ articleId: "e2", feedTitle: null })
    expect(items.slice(1).map((item) => item.articleId)).toEqual([null, null])
  })

  it("generates a parameterized Postgres query with the same stable ordering", async () => {
    setRuntimeDbType("postgres")
    const execute = vi.fn(async () => ({ rows: [] }))
    database.current = postgresDrizzle(execute)
    await EntryAnnotationService.listLibrary({
      kind: "note",
      cursor: { updatedAt: 12, id: "cursor-id", kind: "highlight" },
      limit: 10,
    })
    const [query, params] = execute.mock.calls[0] as unknown as [string, unknown[]]
    expect(query).toContain("union all")
    expect(query).toContain(
      'order by "annotations"."updated_at" desc, "annotations"."id" desc, "kind" desc',
    )
    expect(query).not.toContain("cursor-id")
    expect(params).toContain("cursor-id")
    expect(params.at(-1)).toBe(11)
  })
})
