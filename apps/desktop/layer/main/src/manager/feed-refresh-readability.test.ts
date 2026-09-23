import { DatabaseSync } from "node:sqlite"

import { sqliteMigrations } from "@suhui/database/drizzle/sqlite-baseline"
import { resetRuntimeDbType, setRuntimeDbType } from "@suhui/database/schemas/runtime"
import * as schema from "@suhui/database/schemas/sqlite"
import { EntryService } from "@suhui/database/services/entry"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AnnotationApplicationService } from "~/application/annotations/service"
import { DbService } from "~/ipc/services/db"

import { FeedRefreshService } from "./feed-refresh"

const database = vi.hoisted(() => ({ db: undefined as any }))
vi.mock("@suhui/database/db", () => ({
  get db() {
    return database.db
  },
}))
vi.mock("~/manager/db", () => ({
  DBManager: {
    getDB: () => database.db,
    waitUntilUsable: async () => {},
    runTrackedOperation: (operation: () => Promise<unknown>) => operation(),
  },
}))
vi.mock("electron", () => ({ session: { defaultSession: { resolveProxy: vi.fn() } } }))
vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}))
vi.mock("~/lib/store", () => ({ store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() } }))
vi.mock("~/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}))
vi.mock("~/manager/sync-applier", () => ({ drainPendingOps: async () => {} }))
vi.mock("~/manager/sync-logger", () => ({ syncLogger: { record: vi.fn() } }))
vi.mock("~/manager/refresh-audit-log", () => ({ appendRefreshAuditTrace: vi.fn() }))
vi.mock("~/manager/local-feed-refresh-events", () => ({
  broadcastLocalFeedRefreshCompleted: vi.fn(),
}))
vi.mock("~/application/local-reading/pipeline", () => ({
  localReadingPipeline: { processNewEntries: async () => {} },
}))

const raw = new DatabaseSync(":memory:")
database.db = drizzle(
  async (sql, params, method) => {
    const statement = raw.prepare(sql)
    statement.setReturnArrays(true)
    if (method === "run") {
      statement.run(...(params as never[]))
      return { rows: [] }
    }
    // node:sqlite's types do not reflect setReturnArrays(true).
    const rows = statement.all(...(params as never[])) as unknown as unknown[][]
    return { rows: method === "get" ? (rows[0] ?? []) : rows }
  },
  { schema },
)
for (const migration of sqliteMigrations) {
  for (const statement of migration.statements) raw.exec(statement)
}

beforeEach(() => {
  setRuntimeDbType("sqlite")
  raw.exec("DELETE FROM entry_highlights; DELETE FROM entries; DELETE FROM feeds;")
  raw.exec("INSERT INTO feeds (id, url) VALUES ('f1', 'https://example.com/feed')")
})
afterEach(() => {
  vi.restoreAllMocks()
  resetRuntimeDbType()
})
afterAll(() => raw.close())

describe.each(["manual", "background"] as const)("%s refresh preserves readability", (mode) => {
  it("keeps cached text and highlights while updating RSS and inserting new articles", async () => {
    const rssEntry = {
      id: "e1",
      feedId: "f1",
      guid: "g1",
      url: "https://example.com/1",
      title: "Original",
      content: "RSS summary",
      publishedAt: 1,
      insertedAt: 1,
      read: false,
      readabilityContent: null,
      readabilityUpdatedAt: null,
    }
    await EntryService.upsertMany([rssEntry] as any)
    const annotations = new AnnotationApplicationService()
    const html = "<p>不是模型变得足够聪明，而是人失去了判断能力。</p>"
    await EntryService.patch({ id: "e1", readabilityContent: html, readabilityUpdatedAt: 100 })
    const saved = await annotations.createHighlight({
      entryId: "e1",
      source: "readability",
      quote: "不是模型变得足够聪明",
    })

    const preview = {
      feed: { title: "Updated feed" },
      entries: [
        { ...rssEntry, title: "Updated", content: "Updated RSS summary" },
        { ...rssEntry, id: "e2", guid: "g2", title: "New article", url: "https://example.com/2" },
      ],
    }
    if (mode === "manual") {
      const service = new DbService()
      vi.spyOn(service as any, "buildPreviewData").mockResolvedValue(preview)
      await service.refreshFeed({} as any, "f1")
    } else {
      vi.spyOn(FeedRefreshService, "buildPreviewData").mockResolvedValue(preview as any)
      await FeedRefreshService.refreshFeed("f1")
    }

    const entries = await EntryService.getEntryMany(["e1", "e2"])
    expect(entries.find((entry) => entry.id === "e1")).toMatchObject({
      title: "Updated",
      content: "Updated RSS summary",
      readabilityContent: html,
      readabilityUpdatedAt: 100,
    })
    expect(entries.find((entry) => entry.id === "e2")).toMatchObject({
      readabilityContent: null,
      readabilityUpdatedAt: null,
    })
    await expect(annotations.relocate("e1")).resolves.toEqual([
      expect.objectContaining({ id: saved.id, status: "active" }),
    ])
    await expect(
      annotations.createHighlight({
        entryId: "e1",
        source: "readability",
        quote: "而是人失去了判断能力",
      }),
    ).resolves.toMatchObject({ status: "active" })
  })
})
