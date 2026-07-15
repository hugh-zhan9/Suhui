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

const { loggerInfo, loggerWarn, loggerError } = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}))

const { feedUpsertMany, entryUpsertMany } = vi.hoisted(() => ({
  feedUpsertMany: vi.fn(),
  entryUpsertMany: vi.fn(),
}))

vi.mock("@suhui/database/services/feed", () => ({
  FeedService: { upsertMany: feedUpsertMany },
}))

vi.mock("@suhui/database/services/entry", () => ({
  EntryService: { upsertMany: entryUpsertMany },
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
    info: loggerInfo,
    warn: loggerWarn,
    error: loggerError,
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
  drainPendingOps: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("~/manager/sync-logger", () => ({
  syncLogger: {
    record: vi.fn(),
  },
}))

vi.mock("~/manager/refresh-audit-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/manager/refresh-audit-log")>()
  return {
    ...actual,
    appendRefreshAuditTrace: vi.fn((trace, level, stage, extra) =>
      actual.buildRefreshAuditEvent(trace, level, stage, extra),
    ),
  }
})

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
    loggerInfo.mockReset()
    loggerWarn.mockReset()
    loggerError.mockReset()
    feedUpsertMany.mockReset()
    feedUpsertMany.mockResolvedValue(undefined)
    entryUpsertMany.mockReset()
    entryUpsertMany.mockResolvedValue(undefined)
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

  it("returns and publishes one standalone single-feed ChangeSet with feedId", async () => {
    getDB.mockReturnValue({
      query: {
        feedsTable: {
          findFirst: vi.fn().mockResolvedValue({
            id: "feed-1",
            url: "https://feed-1.example/rss.xml",
            title: "Feed One",
            description: null,
            image: null,
            siteUrl: null,
            errorAt: null,
            ownerUserId: null,
            errorMessage: null,
            subscriptionCount: null,
            updatesPerWeek: null,
            latestEntryPublishedAt: null,
            tipUserIds: null,
            updatedAt: 1,
          }),
        },
      },
    })

    const service = new DbService()
    vi.spyOn(service as any, "buildPreviewData").mockResolvedValue({
      feed: {
        id: "feed-1",
        url: "https://feed-1.example/rss.xml",
        title: "Feed One",
        updatedAt: 2,
      },
      entries: [],
    })

    const result = await service.refreshFeed({} as any, "feed-1", {
      source: "manual-single",
      traceId: "batch-single",
    })

    expect(result).toMatchObject({
      entriesCount: 0,
      batchId: "batch-single",
      changeSet: {
        batchId: "batch-single",
        reason: "refresh",
        feedIds: ["feed-1"],
        feedId: "feed-1",
        refreshed: 1,
        failed: 0,
      },
    })
    expect(broadcastLocalFeedRefreshCompleted).toHaveBeenCalledTimes(1)
    expect("changeSet" in result).toBe(true)
    if (!("changeSet" in result)) throw new Error("Expected standalone refresh ChangeSet")
    expect(broadcastLocalFeedRefreshCompleted).toHaveBeenCalledWith(result.changeSet)
  })

  it.each([1, 10, 50])("emits one completed ChangeSet for %i successful feeds", async (size) => {
    const feeds = Array.from({ length: size }, (_, index) => ({
      id: `feed-${index + 1}`,
      url: `https://feed-${index + 1}.example/rss.xml`,
      ownerUserId: null,
    }))
    getDB.mockReturnValue({
      query: {
        subscriptionsTable: {
          findMany: vi.fn().mockResolvedValue(feeds.map((feed) => ({ feedId: feed.id }))),
        },
        feedsTable: {
          findMany: vi.fn().mockResolvedValue(feeds),
        },
      },
    })

    const service = new DbService()
    vi.spyOn(service, "refreshFeed").mockResolvedValue({ entriesCount: 3 } as never)

    const result = await service.refreshLocalSubscribedFeeds({} as any, {
      source: "startup-auto",
      traceId: `batch-${size}`,
    })

    expect(result.batchId).toBe(`batch-${size}`)
    expect(result.changeSet).toMatchObject({
      batchId: `batch-${size}`,
      reason: "refresh",
      source: "startup-auto",
      scope: "feeds",
      refreshed: size,
      failed: 0,
    })
    expect(result.changeSet.feedIds).toHaveLength(size)
    expect(broadcastLocalFeedRefreshCompleted).toHaveBeenCalledTimes(1)
    expect(broadcastLocalFeedRefreshCompleted).toHaveBeenCalledWith(result.changeSet)
    expect(loggerInfo).toHaveBeenCalledWith("[PerformanceMetric]", {
      metric: "refresh_batch_event_count",
      batchId: `batch-${size}`,
      value: 1,
    })
  })

  it("scopes partial failures to unique successful feed IDs and preserves audit results", async () => {
    getDB.mockReturnValue({
      query: {
        subscriptionsTable: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ feedId: "feed-1" }, { feedId: "feed-2" }, { feedId: "feed-1" }]),
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
    vi.spyOn(service, "refreshFeed").mockImplementation(async (_context, feedId) => {
      if (feedId === "feed-2") throw new Error("refresh failed")
      return { entriesCount: 3 } as never
    })

    const result = await service.refreshLocalSubscribedFeeds({} as any, {
      source: "manual-batch",
      traceId: "batch-partial",
    })

    expect(result).toMatchObject({ total: 2, refreshed: 1, failed: 1 })
    expect(result.results).toEqual([
      { feedId: "feed-1", ok: true, entriesCount: 3 },
      { feedId: "feed-2", ok: false, error: "refresh failed" },
    ])
    expect(result.changeSet.feedIds).toEqual(["feed-1"])
    expect(broadcastLocalFeedRefreshCompleted).toHaveBeenCalledTimes(1)
    expect(broadcastLocalFeedRefreshCompleted).toHaveBeenCalledWith(result.changeSet)
  })

  it("redacts sensitive refresh trace fields while retaining batch diagnostics", async () => {
    const secretQuery = "query-token-secret"
    const secretTitle = "Confidential Feed Title"
    const secretConnection = "postgres://reader:password@localhost:5432/private"
    const secretSql = "SELECT content FROM entries WHERE token = 'sql-token-secret'"
    const secretPath = "/Users/private/Documents/feed.xml"
    const secretBody = "private article body"
    const secretError = "raw refresh failure detail"
    const feedUrl = `https://feeds.example/rss.xml?token=${secretQuery}`

    getDB.mockReturnValue({
      query: {
        subscriptionsTable: {
          findMany: vi.fn().mockResolvedValue([{ feedId: "feed-secret" }]),
        },
        feedsTable: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: "feed-secret", url: feedUrl, ownerUserId: null }]),
        },
      },
    })

    const service = new DbService()
    vi.spyOn(service, "refreshFeed").mockRejectedValue(
      new Error(
        `${secretError}; title=${secretTitle}; database=${secretConnection}; sql=${secretSql}; path=${secretPath}; content=${secretBody}`,
      ),
    )

    const result = await service.refreshLocalSubscribedFeeds({} as any, {
      source: "startup-auto",
      traceId: "batch-secret",
    })

    expect(result).toMatchObject({ batchId: "batch-secret", refreshed: 0, failed: 1 })
    const refreshTraceCalls = [
      ...loggerInfo.mock.calls,
      ...loggerWarn.mock.calls,
      ...loggerError.mock.calls,
    ]
      .filter(([label]) => label === "[RefreshTrace]")
      .map(([, payload]) => payload)
    expect(refreshTraceCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          traceId: "batch-secret",
          source: "startup-auto",
          stage: "batch.feed_start",
          targetFeedId: "feed-secret",
          targetFeedUrl: "https://feeds.example/rss.xml",
        }),
        expect.objectContaining({
          traceId: "batch-secret",
          source: "startup-auto",
          stage: "batch.feed_failed",
          status: "failed",
          targetFeedId: "feed-secret",
        }),
        expect.objectContaining({
          traceId: "batch-secret",
          source: "startup-auto",
          stage: "batch.completed",
          batchId: "batch-secret",
          total: 1,
          refreshed: 0,
          failed: 1,
        }),
      ]),
    )

    const serializedCalls = JSON.stringify(refreshTraceCalls)
    for (const forbidden of [
      secretQuery,
      secretTitle,
      secretConnection,
      secretSql,
      secretPath,
      secretBody,
      secretError,
    ]) {
      expect(serializedCalls).not.toContain(forbidden)
    }
  })

  it("returns a zero-success ChangeSet without publishing an event", async () => {
    getDB.mockReturnValue({
      query: {
        subscriptionsTable: {
          findMany: vi.fn().mockResolvedValue([{ feedId: "feed-1" }]),
        },
        feedsTable: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { id: "feed-1", url: "https://feed-1.example/rss.xml", ownerUserId: null },
            ]),
        },
      },
    })

    const service = new DbService()
    vi.spyOn(service, "refreshFeed").mockRejectedValue(new Error("refresh failed"))

    const result = await service.refreshLocalSubscribedFeeds({} as any, {
      source: "interval-auto",
      traceId: "batch-zero",
    })

    expect(result).toMatchObject({ total: 1, refreshed: 0, failed: 1, batchId: "batch-zero" })
    expect(result.changeSet.feedIds).toEqual([])
    expect(broadcastLocalFeedRefreshCompleted).not.toHaveBeenCalled()
    expect(loggerInfo).toHaveBeenCalledWith("[PerformanceMetric]", {
      metric: "refresh_batch_event_count",
      batchId: "batch-zero",
      value: 0,
    })
    const metricPayload = loggerInfo.mock.calls.find(
      ([label]) => label === "[PerformanceMetric]",
    )?.[1]
    expect(JSON.stringify(metricPayload)).not.toMatch(
      /content|title|https?:|sql|connection|string|\/Users\//i,
    )
  })
})
