import { DatabaseSync } from "node:sqlite"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sqliteMigrations } from "@suhui/database/drizzle/sqlite-baseline"
import * as schema from "@suhui/database/schemas/sqlite"
import { resetRuntimeDbType, setRuntimeDbType } from "@suhui/database/schemas/runtime"

const database = vi.hoisted(() => ({ current: null as any, raw: null as any }))
vi.mock("~/manager/db", () => ({
  DBManager: {
    getDB: () => database.current,
    runTrackedOperation: (task: () => unknown) => task(),
  },
}))
vi.mock("~/manager/feed-refresh", () => ({ FeedRefreshService: { buildPreviewData: vi.fn() } }))
vi.mock("../local-reading/pipeline", () => ({
  localReadingPipeline: { processNewEntries: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock("@suhui/database/db.main", () => ({
  runInMainTransaction: async (task: (tx: any) => Promise<unknown>) => {
    database.raw.exec("BEGIN")
    try {
      const result = await task(database.current)
      database.raw.exec("COMMIT")
      return result
    } catch (error) {
      database.raw.exec("ROLLBACK")
      throw error
    }
  },
}))
import { FeedRepairService } from "./repair-service"

const raw = new DatabaseSync(":memory:")
for (const migration of sqliteMigrations)
  for (const statement of migration.statements) raw.exec(statement)
database.raw = raw
database.current = drizzle(
  async (query, params, method) => {
    const statement = raw.prepare(query)
    if (method === "run") {
      statement.run(...(params as never[]))
      return { rows: [] }
    }
    statement.setReturnArrays(true)
    if (method === "get")
      return { rows: statement.get(...(params as never[])) as unknown as unknown[] }
    return { rows: statement.all(...(params as never[])) as unknown as unknown[][] }
  },
  { schema },
)

beforeEach(() => {
  setRuntimeDbType("sqlite")
  raw.exec(
    "DROP TRIGGER IF EXISTS fail_repair; DELETE FROM entries; DELETE FROM subscriptions; DELETE FROM feeds;",
  )
  raw.exec(`INSERT INTO feeds (id, url, site_url, error_at, error_message) VALUES ('f', 'https://example.com/atom.xml', 'https://example.com/', 1, 'HTTP 404');
    INSERT INTO subscriptions (id, feed_id, type, user_id, view, is_private, hide_from_timeline, created_at) VALUES ('feed/f', 'f', 'feed', 'local', 0, 0, 0, '2026-09-15');
    INSERT INTO entries (id, guid, feed_id, url, read, deleted_at, inserted_at, published_at, content) VALUES
    ('read', 'old-guid', 'f', 'https://example.com/1/', 1, NULL, 1, 1, 'original'),
    ('deleted', 'deleted-guid', 'f', 'https://example.com/2', 0, 1, 1, 1, 'deleted content');`)
})
afterEach(() => resetRuntimeDbType())
afterAll(() => raw.close())

const repair = () =>
  new FeedRepairService({
    preview: vi.fn().mockResolvedValue({
      feed: {
        id: "f",
        url: "https://example.com/rss.xml",
        siteUrl: "https://example.com/",
        title: "Recovered",
      },
      entries: [1, 2, 3].map((id) => ({
        id: `new-${id}`,
        guid: `new-guid-${id}`,
        feedId: "f",
        url: `https://example.com/${id}`,
        read: false,
        insertedAt: 2,
        publishedAt: 2,
        content: "incoming",
      })),
    }),
  }).repair("f")

describe("repair persistence", () => {
  it("updates the source and preserves read articles and tombstones across format changes", async () => {
    expect(await repair()).toMatchObject({ added: 1, url: "https://example.com/rss.xml" })
    expect(raw.prepare("SELECT url, error_at, error_message FROM feeds").get()).toMatchObject({
      url: "https://example.com/rss.xml",
      error_at: null,
      error_message: null,
    })
    expect(
      raw.prepare("SELECT id, read, deleted_at, content FROM entries ORDER BY id").all(),
    ).toEqual([
      expect.objectContaining({ id: "deleted", deleted_at: 1, content: "deleted content" }),
      expect.objectContaining({ id: "new-3", read: 0, content: "incoming" }),
      expect.objectContaining({ id: "read", read: 1, content: "original" }),
    ])
  })
  it("rolls back new articles if updating the source fails", async () => {
    raw.exec(
      "CREATE TRIGGER fail_repair BEFORE UPDATE ON feeds BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;",
    )
    await expect(repair()).rejects.toMatchObject({
      cause: expect.objectContaining({ message: "simulated failure" }),
    })
    expect(raw.prepare("SELECT count(*) AS count FROM entries").get()).toMatchObject({ count: 2 })
    expect(raw.prepare("SELECT url, error_message FROM feeds").get()).toMatchObject({
      url: "https://example.com/atom.xml",
      error_message: "HTTP 404",
    })
  })
})
