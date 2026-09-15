import { DatabaseSync } from "node:sqlite"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sqliteMigrations } from "../drizzle/sqlite-baseline"
import * as schema from "../schemas/sqlite"
import { resetRuntimeDbType, setRuntimeDbType } from "../schemas/runtime"

const database = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("../db", () => ({
  get db() {
    return database.current
  },
}))
const { UnreadService } = await import("./unread")
const raw = new DatabaseSync(":memory:")
for (const migration of sqliteMigrations)
  for (const statement of migration.statements) raw.exec(statement)
const queries: string[] = []
const sqliteDb = drizzle(
  async (query, params) => {
    queries.push(query)
    const statement = raw.prepare(query)
    statement.setReturnArrays(true)
    return { rows: statement.all(...(params as never[])) as unknown[][] }
  },
  { schema },
)
beforeEach(() => {
  setRuntimeDbType("sqlite")
  database.current = sqliteDb
  raw.exec("DELETE FROM entries; DELETE FROM subscriptions; DELETE FROM unread;")
  queries.length = 0
  const sub = raw.prepare(
    "INSERT INTO subscriptions (id, feed_id, type, user_id, view, is_private, hide_from_timeline, created_at) VALUES (?, ?, 'feed', 'local', 0, 0, 0, '2026-09-15')",
  )
  sub.run("feed/f1", "f1")
  sub.run("feed/f2", "f2")
})
afterEach(() => resetRuntimeDbType())
afterAll(() => raw.close())
const entry = (id: string, feedId: string, read: number | null, deleted: number | null = null) =>
  raw
    .prepare(
      "INSERT INTO entries (id, guid, feed_id, read, deleted_at, inserted_at, published_at, content) VALUES (?, ?, ?, ?, ?, 1, 1, 'BODY MUST NOT BE LOADED')",
    )
    .run(id, id, feedId, read, deleted)

describe("full-library unread summary", () => {
  it("counts unloaded articles including NULL read and ignores deleted/inactive sources", async () => {
    for (let i = 0; i < 250; i++) entry(`e${i}`, "f1", i === 0 ? null : 0)
    entry("read", "f1", 1)
    entry("deleted", "f1", 0, 1)
    entry("orphan", "unsubscribed", 0)
    const result = await UnreadService.getUnreadAll()
    expect(result).toEqual([
      { id: "f1", count: 250 },
      { id: "f2", count: 0 },
    ])
    expect(queries.join("\n")).not.toContain('"content"')
    raw.exec("UPDATE entries SET read = 1")
    expect(await UnreadService.getUnreadAll()).toEqual([
      { id: "f1", count: 0 },
      { id: "f2", count: 0 },
    ])
  })
  it("counts list membership once per article", async () => {
    raw.exec(
      "INSERT INTO subscriptions (id, list_id, type, user_id, view, is_private, hide_from_timeline, created_at) VALUES ('list/l1', 'l1', 'list', 'local', 0, 0, 0, '2026-09-15')",
    )
    entry("list-entry", "f1", 0)
    raw.exec(`UPDATE entries SET sources = '["l1", "l1"]'`)
    expect(await UnreadService.getUnreadAll()).toContainEqual({ id: "l1", count: 1 })
  })
})
