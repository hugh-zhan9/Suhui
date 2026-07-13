import { vi } from "vitest"

const { waitUntilUsable, getDB } = vi.hoisted(() => ({
  waitUntilUsable: vi.fn(),
  getDB: vi.fn(),
}))

const { broadcastLocalFeedRefreshCompleted } = vi.hoisted(() => ({
  broadcastLocalFeedRefreshCompleted: vi.fn(),
}))

const { queryList, queryGetDetail } = vi.hoisted(() => ({
  queryList: vi.fn(),
  queryGetDetail: vi.fn(),
}))

vi.mock("electron", () => ({
  session: {
    defaultSession: {
      resolveProxy: vi.fn(),
    },
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}))

vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}))

vi.mock("~/lib/store", () => ({
  store: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock("~/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}))

vi.mock("~/manager/db", () => ({
  DBManager: {
    waitUntilUsable,
    getDB,
    getDialect: vi.fn(),
  },
}))

vi.mock("~/manager/sync-applier", () => ({
  drainPendingOps: vi.fn(),
}))

vi.mock("~/manager/sync-logger", () => ({
  syncLogger: {
    record: vi.fn(),
  },
}))

vi.mock("~/manager/refresh-audit-log", () => ({
  appendRefreshAuditTrace: vi.fn(),
}))

vi.mock("~/manager/local-feed-refresh-events", () => ({
  broadcastLocalFeedRefreshCompleted,
}))

vi.mock("~/application/entry/query-service", () => ({
  entryQueryService: {
    list: queryList,
    getDetail: queryGetDetail,
  },
}))

import { beforeEach, describe, expect, it } from "vitest"
import { DbService } from "./db"

describe("DbService", () => {
  beforeEach(() => {
    waitUntilUsable.mockReset()
    waitUntilUsable.mockResolvedValue(undefined)
    getDB.mockReset()
    broadcastLocalFeedRefreshCompleted.mockReset()
    queryList.mockReset()
    queryGetDetail.mockReset()
  })

  it("maps db.listEntries directly and keeps deprecated getEntries bounded", async () => {
    queryList
      .mockResolvedValueOnce({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      })
      .mockResolvedValueOnce({
        items: [{ id: "entry-1", recordKind: "summary" }],
        page: { limit: 100, hasMore: false, nextCursor: null },
      })

    const service = new DbService()
    const page = await service.listEntries({} as any, { scope: { kind: "timeline" } })

    expect(queryList).toHaveBeenCalledWith({ scope: { kind: "timeline" } })
    expect(page.page.limit).toBe(20)

    await expect(service.getEntries({} as any, "feed-1")).resolves.toEqual([
      { id: "entry-1", recordKind: "summary" },
    ])
    expect(queryList).toHaveBeenLastCalledWith({
      scope: { kind: "feeds", feedIds: ["feed-1"] },
      limit: 100,
    })
  })

  it("uses the desktop-non-deleted detail visibility policy", async () => {
    queryGetDetail.mockResolvedValue({ id: "entry-1", recordKind: "detail" })

    const service = new DbService()

    await expect(service.getEntry({} as any, "entry-1")).resolves.toEqual({
      id: "entry-1",
      recordKind: "detail",
    })
    expect(queryGetDetail).toHaveBeenCalledWith("entry-1", "desktop-non-deleted")
  })

  it("should expose preview and local refresh methods", () => {
    const service = new DbService()
    expect(service.previewFeed).toBeDefined()
    expect(service.refreshLocalSubscribedFeeds).toBeDefined()
  })

  it("broadcasts startup-auto refresh progress as each feed completes", async () => {
    getDB.mockReturnValue({
      query: {
        subscriptionsTable: {
          findMany: vi.fn().mockResolvedValue([{ feedId: "feed-1" }, { feedId: "feed-2" }]),
        },
        feedsTable: {
          findMany: vi.fn().mockResolvedValue([
            { id: "feed-1", url: "https://feed-1.example/rss.xml", ownerUserId: null },
            { id: "feed-2", url: "https://feed-2.example/rss.xml", ownerUserId: null },
          ]),
        },
      },
    })

    const service = new DbService()
    vi.spyOn(service, "refreshFeed")
      .mockResolvedValueOnce({ entriesCount: 3 } as never)
      .mockResolvedValueOnce({ entriesCount: 5 } as never)

    await service.refreshLocalSubscribedFeeds({} as any, { source: "startup-auto" })

    expect(broadcastLocalFeedRefreshCompleted).toHaveBeenCalledWith({
      source: "startup-auto",
      result: {
        refreshed: 1,
        failed: 0,
        results: [{ feedId: "feed-1", ok: true, entriesCount: 3 }],
      },
    })
    expect(broadcastLocalFeedRefreshCompleted).toHaveBeenCalledWith({
      source: "startup-auto",
      result: {
        refreshed: 2,
        failed: 0,
        results: [
          { feedId: "feed-1", ok: true, entriesCount: 3 },
          { feedId: "feed-2", ok: true, entriesCount: 5 },
        ],
      },
    })
  })
})
