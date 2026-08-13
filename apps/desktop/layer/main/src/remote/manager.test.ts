import { afterEach, describe, expect, it, vi } from "vitest"

import { isLoopbackPeer, isPrivateLocalReadingRoute } from "./manager"

describe("remote local-reading boundary", () => {
  it("recognizes loopback peers including IPv4-mapped IPv6", () => {
    expect(isLoopbackPeer("127.0.0.1")).toBe(true)
    expect(isLoopbackPeer("::1")).toBe(true)
    expect(isLoopbackPeer("::ffff:127.0.0.1")).toBe(true)
    expect(isLoopbackPeer("192.168.1.50")).toBe(false)
  })

  it("classifies private local-reading routes without blocking OPML", () => {
    expect(isPrivateLocalReadingRoute("/api/rules")).toBe(true)
    expect(isPrivateLocalReadingRoute("/api/entries/e1/annotations")).toBe(true)
    expect(isPrivateLocalReadingRoute("/api/reading-queue/e1")).toBe(true)
    expect(isPrivateLocalReadingRoute("/api/opml")).toBe(false)
    expect(isPrivateLocalReadingRoute("/api/entries")).toBe(false)
  })
})

const bootstrapProviders = vi.hoisted(() => ({
  getCapabilities: vi.fn().mockReturnValue({ auth: "none" }),
  getSettings: vi.fn().mockReturnValue({ appearance: "system", rsshubCustomUrl: "" }),
  listCollections: vi.fn().mockResolvedValue([]),
  listSubscriptions: vi.fn().mockResolvedValue([]),
  listUnreadCounts: vi.fn().mockResolvedValue([]),
}))

const localFeedRefreshEvents = vi.hoisted(() => ({
  broadcastLocalFeedRefreshCompleted: vi.fn(),
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
    waitUntilUsable: vi.fn().mockResolvedValue(undefined),
    beginMaintenance: vi.fn(),
    getDB: vi.fn(),
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
  broadcastLocalFeedRefreshCompleted: localFeedRefreshEvents.broadcastLocalFeedRefreshCompleted,
}))

vi.mock("~/application/discover/service", () => ({
  discoverApplicationService: {
    request: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("~/application/feed/service", () => ({
  feedApplicationService: {
    previewFeed: vi.fn().mockResolvedValue({}),
    refreshFeed: vi.fn().mockResolvedValue({}),
    refreshAllFeeds: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("~/application/agent/service", () => ({
  agentApplicationService: {
    listEntries: vi.fn().mockResolvedValue({ items: [], page: { limit: 20, hasMore: false } }),
    getEntry: vi.fn().mockResolvedValue(null),
    listFeeds: vi.fn().mockResolvedValue({ items: [] }),
    updateReadStatus: vi.fn().mockResolvedValue({ updated: 0, read: true }),
  },
}))

vi.mock("~/application/entry/query-service", () => ({
  entryQueryService: {
    list: vi.fn().mockResolvedValue({
      items: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
    }),
    getDetail: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock("~/application/import-export/service", () => ({
  importExportApplicationService: {
    exportData: vi.fn().mockResolvedValue({ version: 1 }),
    importData: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("~/application/collection/service", () => ({
  collectionApplicationService: {
    listCollections: bootstrapProviders.listCollections,
    updateEntryStar: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("~/application/pdf/service", () => ({
  pdfApplicationService: {
    renderEntryPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7")),
  },
}))

vi.mock("~/application/rsshub/service", () => ({
  rsshubApplicationService: {
    getConfig: vi.fn().mockReturnValue({ customUrl: "" }),
    setConfig: vi.fn().mockImplementation((input) => ({ customUrl: input.customUrl || "" })),
    precheck: vi.fn().mockReturnValue({ ok: true }),
  },
}))

vi.mock("~/application/settings/service", () => ({
  settingsApplicationService: {
    getCapabilities: bootstrapProviders.getCapabilities,
    getSettings: bootstrapProviders.getSettings,
    updateSettings: vi.fn().mockImplementation((input) => ({
      appearance: input.appearance || "system",
      rsshubCustomUrl: input.rsshubCustomUrl || "",
    })),
  },
}))

vi.mock("~/application/subscription/service", () => ({
  subscriptionApplicationService: {
    listSubscriptions: bootstrapProviders.listSubscriptions,
    createSubscription: vi.fn().mockResolvedValue({}),
    deleteSubscription: vi.fn().mockResolvedValue(undefined),
    deleteSubscriptionsByTargets: vi.fn().mockResolvedValue(undefined),
    updateSubscription: vi.fn().mockResolvedValue({}),
    batchUpdateSubscriptions: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("~/application/unread/service", () => ({
  unreadApplicationService: {
    listUnreadCounts: bootstrapProviders.listUnreadCounts,
  },
}))

vi.mock("~/application/annotations/service", () => ({
  annotationApplicationService: {
    list: vi.fn().mockResolvedValue({ notes: [], highlights: [] }),
    createNote: vi.fn().mockResolvedValue({}),
    updateNote: vi.fn().mockResolvedValue({}),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    createHighlight: vi.fn().mockResolvedValue({}),
    deleteHighlight: vi.fn().mockResolvedValue(undefined),
    relocate: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock("~/application/dedup/service", () => ({
  dedupApplicationService: {
    splitMember: vi.fn().mockResolvedValue(undefined),
    setRepresentative: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("~/application/reading-queue/service", () => ({
  readingQueueApplicationService: {
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue({ status: "pending" }),
    complete: vi.fn().mockResolvedValue({ status: "completed" }),
    remove: vi.fn().mockResolvedValue(undefined),
    stats: vi.fn().mockResolvedValue({ pending: 0, completed7Days: 0, completed30Days: 0 }),
  },
}))

vi.mock("~/application/rules/service", () => ({
  ruleApplicationService: {
    listRules: vi.fn().mockResolvedValue([]),
    createRule: vi.fn().mockResolvedValue({}),
    updateRule: vi.fn().mockResolvedValue({}),
    deleteRule: vi.fn().mockResolvedValue(undefined),
    previewHistory: vi.fn().mockResolvedValue({ token: "token", matchCount: 0 }),
    executeHistory: vi.fn().mockResolvedValue({ applied: 0 }),
    getTags: vi.fn().mockResolvedValue([]),
    addTags: vi.fn().mockResolvedValue([]),
    removeTags: vi.fn().mockResolvedValue([]),
    setHidden: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("~/application/opml/service", () => ({
  opmlApplicationService: {
    export: vi.fn().mockResolvedValue('<opml version="2.0"/>'),
    preview: vi.fn().mockResolvedValue([]),
    import: vi.fn().mockResolvedValue({ imported: 0, skipped: 0, total: 0 }),
  },
}))

import { RemoteServerManager } from "./manager"
import { agentReadStatusMaxEntryIds } from "~/application/agent/types"
import { encodeEntryCursor } from "~/application/entry/query-cursor"
import { entryQueryService } from "~/application/entry/query-service"
import type { EntryListQuery } from "~/application/entry/query-types"
import { DbService } from "~/ipc/services/db"

describe("RemoteServerManager", () => {
  const readChunkWithTimeout = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    timeoutMs = 300,
  ) =>
    Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])

  afterEach(async () => {
    await RemoteServerManager.stop()
    delete process.env.SUHUI_PERFORMANCE_HARNESS
    delete process.env.SUHUI_PERFORMANCE_PROFILE_ID
    delete process.env.SUHUI_PERFORMANCE_CAPABILITY
    localFeedRefreshEvents.broadcastLocalFeedRefreshCompleted.mockReset()
  })

  it("serves health and status endpoints", async () => {
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
    })

    const healthResponse = await fetch(`${server.baseUrl}/health`)
    expect(healthResponse.status).toBe(200)
    await expect(healthResponse.json()).resolves.toEqual({
      ok: true,
    })

    const statusResponse = await fetch(`${server.baseUrl}/status`)
    expect(statusResponse.status).toBe(200)
    await expect(statusResponse.json()).resolves.toMatchObject({
      running: true,
      host: "127.0.0.1",
      port: server.port,
      baseUrl: server.baseUrl,
    })
  })

  it("exposes shared annotation, cluster, and reading queue services over HTTP", async () => {
    const listAnnotations = vi.fn().mockResolvedValue({ notes: [{ id: "note-1" }], highlights: [] })
    const addToReadingQueue = vi.fn().mockResolvedValue({ entryId: "entry-1", status: "pending" })
    const setClusterRepresentative = vi.fn().mockResolvedValue(undefined)
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      listAnnotations,
      addToReadingQueue,
      setClusterRepresentative,
    })

    const annotations = await fetch(`${server.baseUrl}/api/entries/entry-1/annotations`)
    expect(annotations.status).toBe(200)
    await expect(annotations.json()).resolves.toEqual({
      data: { notes: [{ id: "note-1" }], highlights: [] },
    })

    const queued = await fetch(`${server.baseUrl}/api/reading-queue/entry-1`, { method: "PUT" })
    expect(queued.status).toBe(200)
    expect(listAnnotations).toHaveBeenCalledWith("entry-1")
    expect(addToReadingQueue).toHaveBeenCalledWith("entry-1")

    const representative = await fetch(`${server.baseUrl}/api/clusters/cluster-1/representative`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: "entry-1" }),
    })
    expect(representative.status).toBe(200)
    expect(setClusterRepresentative).toHaveBeenCalledWith({
      clusterId: "cluster-1",
      entryId: "entry-1",
    })
  })

  it("exports, previews, and selectively imports OPML through the shared service", async () => {
    const exportOpml = vi.fn().mockResolvedValue('<opml version="2.0"/>')
    const previewOpml = vi.fn().mockResolvedValue([{ index: 0, url: "https://example.com/feed" }])
    const importOpml = vi.fn().mockResolvedValue({ imported: 1, skipped: 0, total: 1 })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      exportOpml,
      previewOpml,
      importOpml,
    })

    const exported = await fetch(`${server.baseUrl}/api/opml`)
    expect(exported.status).toBe(200)
    await expect(exported.text()).resolves.toContain("<opml")

    const preview = await fetch(`${server.baseUrl}/api/opml/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xml: "<opml/>" }),
    })
    expect(preview.status).toBe(200)
    expect(previewOpml).toHaveBeenCalledWith("<opml/>")

    const imported = await fetch(`${server.baseUrl}/api/opml/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xml: "<opml/>", selectedIndexes: [0] }),
    })
    expect(imported.status).toBe(200)
    expect(importOpml).toHaveBeenCalledWith("<opml/>", [0])
  })

  it("keeps the performance refresh route disabled outside a marked harness launch", async () => {
    const server = await RemoteServerManager.start({ host: "127.0.0.1", port: 0 })
    const response = await fetch(`${server.baseUrl}/__performance__/refresh-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: "batch-1", feedIds: ["feed-1"] }),
    })
    expect(response.status).toBe(404)
    expect(localFeedRefreshEvents.broadcastLocalFeedRefreshCompleted).not.toHaveBeenCalled()
  })

  it("requires the launch-scoped performance capability", async () => {
    process.env.SUHUI_PERFORMANCE_HARNESS = "1"
    process.env.SUHUI_PERFORMANCE_PROFILE_ID = "suhui-performance-t002-normal"
    process.env.SUHUI_PERFORMANCE_CAPABILITY = "a".repeat(64)
    const server = await RemoteServerManager.start({ host: "127.0.0.1", port: 0 })
    const response = await fetch(`${server.baseUrl}/__performance__/refresh-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Suhui-Performance-Capability": "b".repeat(64),
      },
      body: JSON.stringify({ batchId: "batch-1", feedIds: ["feed-1"] }),
    })
    expect(response.status).toBe(403)
    expect(localFeedRefreshEvents.broadcastLocalFeedRefreshCompleted).not.toHaveBeenCalled()
  })

  it("validates and broadcasts an authorized bounded performance refresh event", async () => {
    const capability = "c".repeat(64)
    process.env.SUHUI_PERFORMANCE_HARNESS = "1"
    process.env.SUHUI_PERFORMANCE_PROFILE_ID = "suhui-performance-t002-normal"
    process.env.SUHUI_PERFORMANCE_CAPABILITY = capability
    localFeedRefreshEvents.broadcastLocalFeedRefreshCompleted.mockReturnValue(1)
    const server = await RemoteServerManager.start({ host: "127.0.0.1", port: 0 })
    const request = (body: unknown) =>
      fetch(`${server.baseUrl}/__performance__/refresh-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Suhui-Performance-Capability": capability,
        },
        body: JSON.stringify(body),
      })

    expect((await request({ batchId: "batch-1", feedIds: [] })).status).toBe(400)
    expect(localFeedRefreshEvents.broadcastLocalFeedRefreshCompleted).not.toHaveBeenCalled()

    const response = await request({ batchId: "batch-1", feedIds: ["feed-1", "feed-2"] })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ eventCount: 1, feedCount: 2 })
    expect(localFeedRefreshEvents.broadcastLocalFeedRefreshCompleted).toHaveBeenCalledTimes(1)
    expect(localFeedRefreshEvents.broadcastLocalFeedRefreshCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch-1",
        reason: "refresh",
        source: "performance-harness",
        feedIds: ["feed-1", "feed-2"],
      }),
    )
  })

  it("serves subscriptions from the injected provider", async () => {
    const getSubscriptions = vi.fn().mockResolvedValue([
      {
        id: "sub_1",
        type: "feed",
        feedId: "feed_1",
        userId: "local_user",
        view: 1,
        isPrivate: false,
        title: "Feed One",
        category: "Tech",
      },
    ])

    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions,
    })

    const response = await fetch(`${server.baseUrl}/api/subscriptions`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: "sub_1",
          type: "feed",
          feedId: "feed_1",
          userId: "local_user",
          view: 1,
          isPrivate: false,
          title: "Feed One",
          category: "Tech",
        },
      ],
    })
    expect(getSubscriptions).toHaveBeenCalledTimes(1)
  })

  it("serves remote client html and assets from the injected providers", async () => {
    const abortController = new AbortController()
    const getRemoteIndexHtml = vi
      .fn()
      .mockResolvedValue(
        '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/remote-entry.js"></script></body></html>',
      )
    const getRemoteAsset = vi.fn().mockImplementation(async (pathname: string) => {
      if (pathname === "/assets/remote-entry.js") {
        return {
          contentType: "text/javascript; charset=utf-8",
          content: 'console.log("remote-entry")',
        }
      }
      return null
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      getRemoteIndexHtml,
      getRemoteAsset,
    })

    const htmlResponse = await fetch(`${server.baseUrl}/`)
    expect(htmlResponse.status).toBe(200)
    expect(htmlResponse.headers.get("content-type")).toContain("text/html")
    const html = await htmlResponse.text()
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('src="/assets/remote-entry.js"')
    expect(getRemoteIndexHtml).toHaveBeenCalledTimes(1)

    const jsResponse = await fetch(`${server.baseUrl}/assets/remote-entry.js`)
    expect(jsResponse.status).toBe(200)
    expect(jsResponse.headers.get("content-type")).toContain("javascript")
    await expect(jsResponse.text()).resolves.toContain("remote-entry")
    expect(getRemoteAsset).toHaveBeenCalledWith("/assets/remote-entry.js")

    const eventsResponse = await fetch(`${server.baseUrl}/events`, {
      signal: abortController.signal,
    })
    expect(eventsResponse.status).toBe(200)
    expect(eventsResponse.headers.get("content-type")).toContain("text/event-stream")
    const reader = eventsResponse.body!.getReader()
    const firstChunk = await reader.read()
    const payload = new TextDecoder().decode(firstChunk.value)
    expect(payload).toContain("event: ready")
    expect(payload).toContain('{"connected":true}')
    abortController.abort()
  })

  it("returns a bounded additive HTTP page and preserves repeated feed scopes", async () => {
    const listEntries = vi.fn().mockResolvedValue({
      items: [
        {
          id: "entry_1",
          feedId: "feed_1",
          title: "Entry One",
          publishedAt: 1710000000000,
        },
      ],
      page: { limit: 2, hasMore: true, nextCursor: "opaque-cursor" },
    })

    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries,
    })

    const response = await fetch(
      `${server.baseUrl}/api/entries?feedId=feed_1&feedId=feed_2&unreadOnly=true&limit=2`,
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: "entry_1",
          feedId: "feed_1",
          title: "Entry One",
          publishedAt: 1710000000000,
        },
      ],
      page: { limit: 2, hasMore: true, nextCursor: "opaque-cursor" },
    })
    expect(listEntries).toHaveBeenCalledWith({
      scope: { kind: "feeds", feedIds: ["feed_1", "feed_2"] },
      read: false,
      limit: 2,
    })
  })

  it("preserves identical items and page semantics through IPC and HTTP", async () => {
    const query: EntryListQuery = {
      scope: { kind: "feeds", feedIds: ["feed_1", "feed_2"] },
      read: false,
      limit: 2,
    }
    const page = {
      items: [
        {
          id: "entry_1",
          feedId: "feed_1",
          title: "Entry One",
          recordKind: "summary",
          read: false,
        },
      ],
      page: { limit: 2, hasMore: true, nextCursor: "opaque-cursor" },
    }
    const list = vi.mocked(entryQueryService.list)
    list.mockClear()
    list.mockResolvedValueOnce(page as never).mockResolvedValueOnce(page as never)

    const ipcPage = await new DbService().listEntries({} as any, query)
    const server = await RemoteServerManager.start({ host: "127.0.0.1", port: 0 })
    const response = await fetch(
      `${server.baseUrl}/api/entries?feedId=feed_1&feedId=feed_2&unreadOnly=true&limit=2`,
    )
    const httpPage = await response.json()

    expect(response.status).toBe(200)
    expect({ items: httpPage.data, page: httpPage.page }).toEqual(ipcPage)
    expect(list).toHaveBeenNthCalledWith(1, query)
    expect(list).toHaveBeenNthCalledWith(2, query)
  })

  it.each([
    [
      "list",
      "?listId=list_1&read=true&limit=7",
      {
        scope: { kind: "list", listId: "list_1" },
        read: true,
        limit: 7,
      },
    ],
    [
      "inbox",
      "?inboxId=inbox_1&unreadOnly=1",
      {
        scope: { kind: "inbox", inboxId: "inbox_1" },
        read: false,
      },
    ],
    [
      "collection",
      "?isCollection=true&view=2",
      {
        scope: { kind: "collection", view: 2 },
      },
    ],
    [
      "timeline view/excludePrivate",
      "?view=1&excludePrivate=true",
      {
        scope: { kind: "timeline", view: 1, excludePrivate: true },
      },
    ],
  ] as const)("normalizes positive HTTP %s queries", async (_name, query, expected) => {
    const listEntries = vi.fn().mockResolvedValue({
      items: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      listEntries,
    })

    const response = await fetch(`${server.baseUrl}/api/entries${query}`)

    expect(response.status).toBe(200)
    expect(listEntries).toHaveBeenCalledWith(expected)
  })

  it("preserves an opaque HTTP cursor during normalization", async () => {
    const cursor = encodeEntryCursor({
      v: 1,
      publishedAt: 1710000000000,
      insertedAt: 1710000001000,
      id: "entry_1",
    })
    const listEntries = vi.fn().mockResolvedValue({
      items: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      listEntries,
    })

    const response = await fetch(
      `${server.baseUrl}/api/entries?feedId=feed_1&cursor=${encodeURIComponent(cursor)}`,
    )

    expect(response.status).toBe(200)
    expect(listEntries).toHaveBeenCalledWith({
      scope: { kind: "feeds", feedIds: ["feed_1"] },
      cursor,
    })
  })

  it("defaults the HTTP list to a bounded timeline page", async () => {
    const listEntries = vi.fn().mockResolvedValue({
      items: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })

    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries,
    })

    const response = await fetch(`${server.baseUrl}/api/entries`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })
    expect(listEntries).toHaveBeenCalledWith({ scope: { kind: "timeline" } })
  })

  it.each([
    ["?feedId=f1&listId=l1", "SUHUI_INVALID_ENTRY_SCOPE"],
    ["?feedId=f1&excludePrivate=true", "SUHUI_INVALID_ENTRY_SCOPE"],
    ["?unreadOnly=true&read=true", "SUHUI_INVALID_READ_FILTER"],
    ["?limit=101", "SUHUI_INVALID_LIMIT"],
    ["?cursor=broken", "SUHUI_INVALID_CURSOR"],
  ])("returns a stable 400 for %s", async (query, code) => {
    const listEntries = vi.fn().mockImplementation(async (input) => {
      if (input.cursor) {
        const { EntryQueryError } = await import("~/application/entry/query-types")
        throw new EntryQueryError("SUHUI_INVALID_CURSOR", "cursor is invalid")
      }
      return { items: [], page: { limit: 20, hasMore: false, nextCursor: null } }
    })
    const server = await RemoteServerManager.start({ host: "127.0.0.1", port: 0, listEntries })

    const response = await fetch(`${server.baseUrl}/api/entries${query}`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code } })
  })

  it("redacts unexpected entry list failures", async () => {
    const listEntries = vi
      .fn()
      .mockRejectedValue(new Error('select * from entries password="secret" /Users/private'))
    const server = await RemoteServerManager.start({ host: "127.0.0.1", port: 0, listEntries })

    const response = await fetch(`${server.baseUrl}/api/entries`)
    const body = await response.text()

    expect(response.status).toBe(500)
    expect(body).toContain("SUHUI_ENTRY_QUERY_INTERNAL_ERROR")
    expect(body).not.toContain("select *")
    expect(body).not.toContain("secret")
    expect(body).not.toContain("/Users/private")
  })

  it("serves agent entries from the injected provider with parsed query options", async () => {
    const getAgentEntries = vi.fn().mockResolvedValue({
      items: [
        {
          id: "entry_1",
          feedId: "feed_1",
          title: "Agent Entry",
          read: false,
        },
      ],
      page: {
        limit: 15,
        hasMore: false,
        nextCursor: null,
      },
    })

    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getAgentEntries,
    })

    const response = await fetch(
      `${server.baseUrl}/api/agent/entries?feedId=feed_1&read=false&limit=15&cursor=cursor_1&withSummary=true`,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        items: [
          {
            id: "entry_1",
            feedId: "feed_1",
            title: "Agent Entry",
            read: false,
          },
        ],
        page: {
          limit: 15,
          hasMore: false,
          nextCursor: null,
        },
      },
    })
    expect(getAgentEntries).toHaveBeenCalledWith({
      feedId: "feed_1",
      read: false,
      limit: 15,
      cursor: "cursor_1",
      withSummary: true,
    })
  })

  it("rejects invalid agent read query values", async () => {
    const getAgentEntries = vi.fn().mockResolvedValue({
      items: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getAgentEntries,
    })

    const response = await fetch(`${server.baseUrl}/api/agent/entries?read=flase`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SUHUI_INVALID_READ_FILTER",
        message: "read must be true, false, 1, or 0",
      },
    })
    expect(getAgentEntries).not.toHaveBeenCalled()
  })

  it("sanitizes unexpected agent errors", async () => {
    const getAgentEntries = vi.fn().mockRejectedValue(new Error("database password leaked"))
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getAgentEntries,
    })

    const response = await fetch(`${server.baseUrl}/api/agent/entries`)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SUHUI_AGENT_INTERNAL_ERROR",
        message: "Agent API failed",
      },
    })
  })

  it("does not persist injected agent providers after restart", async () => {
    const getAgentFeeds = vi.fn().mockResolvedValue({ items: [] })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getAgentFeeds,
    })
    await fetch(`${server.baseUrl}/api/agent/feeds`)
    expect(getAgentFeeds).toHaveBeenCalledTimes(1)

    await RemoteServerManager.stop()
    const restarted = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
    })
    const response = await fetch(`${restarted.baseUrl}/api/agent/feeds`)

    expect(response.status).toBe(200)
    expect(getAgentFeeds).toHaveBeenCalledTimes(1)
  })

  it("returns a 404 agent error when agent entry detail is missing", async () => {
    const getAgentEntry = vi.fn().mockResolvedValue(null)
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getAgentEntry,
    })

    const response = await fetch(`${server.baseUrl}/api/agent/entries/missing_entry`)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SUHUI_ENTRY_NOT_FOUND",
        message: "Entry not found",
      },
    })
    expect(getAgentEntry).toHaveBeenCalledWith("missing_entry")
  })

  it("serves agent feeds from the injected provider", async () => {
    const getAgentFeeds = vi.fn().mockResolvedValue({
      items: [
        {
          id: "feed_1",
          subscriptionId: "feed/feed_1",
          title: "Feed One",
          unreadCount: 3,
        },
      ],
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getAgentFeeds,
    })

    const response = await fetch(`${server.baseUrl}/api/agent/feeds`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        items: [
          {
            id: "feed_1",
            subscriptionId: "feed/feed_1",
            title: "Feed One",
            unreadCount: 3,
          },
        ],
      },
    })
    expect(getAgentFeeds).toHaveBeenCalledTimes(1)
  })

  it("updates agent read status through the injected provider", async () => {
    const updateAgentReadStatus = vi.fn().mockResolvedValue({
      updated: 2,
      read: true,
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      updateAgentReadStatus,
    })

    const response = await fetch(`${server.baseUrl}/api/agent/entries/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entryIds: ["entry_1", "entry_2"],
        read: true,
      }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      data: { updated: 2, read: true },
      batchId: expect.any(String),
      changeSet: { reason: "read", entryIds: ["entry_1", "entry_2"] },
    })
    expect(payload.batchId).toBe(payload.changeSet.batchId)
    expect(updateAgentReadStatus).toHaveBeenCalledWith({
      entryIds: ["entry_1", "entry_2"],
      read: true,
    })
  })

  it.each([
    [
      "missing read",
      { entryIds: ["entry_1"] },
      "SUHUI_INVALID_READ_STATUS",
      "read must be true or false",
    ],
    [
      "null read",
      { entryIds: ["entry_1"], read: null },
      "SUHUI_INVALID_READ_STATUS",
      "read must be true or false",
    ],
    [
      "non-array entryIds",
      { entryIds: "entry_1", read: true },
      "SUHUI_INVALID_ENTRY_IDS",
      "entryIds must be a non-empty string array",
    ],
    [
      "non-string entry ID",
      { entryIds: ["entry_1", 1], read: true },
      "SUHUI_INVALID_ENTRY_IDS",
      "entryIds must be a non-empty string array",
    ],
    [
      "too many entry IDs",
      {
        entryIds: Array.from({ length: agentReadStatusMaxEntryIds + 1 }, (_, index) => {
          return `entry_${index}`
        }),
        read: true,
      },
      "SUHUI_INVALID_ENTRY_IDS",
      `entryIds must include at most ${agentReadStatusMaxEntryIds} ids`,
    ],
  ])("rejects invalid agent read status payloads: %s", async (_name, body, code, message) => {
    const updateAgentReadStatus = vi.fn().mockResolvedValue({ updated: 1, read: true })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      updateAgentReadStatus,
    })

    const response = await fetch(`${server.baseUrl}/api/agent/entries/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    })
    expect(updateAgentReadStatus).not.toHaveBeenCalled()
  })

  it("rejects malformed agent read status JSON as a 400 client error", async () => {
    const updateAgentReadStatus = vi.fn().mockResolvedValue({ updated: 1, read: true })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      updateAgentReadStatus,
    })

    const response = await fetch(`${server.baseUrl}/api/agent/entries/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SUHUI_INVALID_JSON",
        message: "request body must be valid JSON",
      },
    })
    expect(updateAgentReadStatus).not.toHaveBeenCalled()
  })

  it("serves entry detail from the injected provider", async () => {
    const getEntry = vi.fn().mockResolvedValue({
      id: "entry_1",
      title: "Entry One",
      content: "<p>Hello</p>",
      readabilityContent: "<article>Hello</article>",
    })

    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      getEntry,
    })

    const response = await fetch(`${server.baseUrl}/api/entries/entry_1`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "entry_1",
        title: "Entry One",
        content: "<p>Hello</p>",
        readabilityContent: "<article>Hello</article>",
      },
    })
    expect(getEntry).toHaveBeenCalledWith("entry_1")
  })

  it("uses active-relations visibility for default remote detail and PDF", async () => {
    const getDetail = vi.mocked(entryQueryService.getDetail)
    getDetail.mockClear()
    getDetail.mockResolvedValue({
      id: "entry_1",
      title: "Entry One",
      content: "<p>Hello</p>",
      readabilityContent: null,
    } as never)

    const server = await RemoteServerManager.start({ host: "127.0.0.1", port: 0 })

    expect((await fetch(`${server.baseUrl}/api/entries/entry_1`)).status).toBe(200)
    expect((await fetch(`${server.baseUrl}/api/entries/entry_1/pdf`)).status).toBe(200)
    expect(getDetail).toHaveBeenNthCalledWith(1, "entry_1", "active-relations")
    expect(getDetail).toHaveBeenNthCalledWith(2, "entry_1", "active-relations")
  })

  it("serves unread counts from the injected provider", async () => {
    const getUnreadCounts = vi.fn().mockResolvedValue([
      { id: "feed_1", count: 3 },
      { id: "feed_2", count: 1 },
    ])

    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      getUnreadCounts,
    })

    const response = await fetch(`${server.baseUrl}/api/unread`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [
        { id: "feed_1", count: 3 },
        { id: "feed_2", count: 1 },
      ],
    })
    expect(getUnreadCounts).toHaveBeenCalledTimes(1)
  })

  it("serves collections from the injected provider", async () => {
    const getCollections = vi.fn().mockResolvedValue([
      {
        entryId: "entry_1",
        feedId: "feed_1",
        view: 1,
        createdAt: "2026-05-09T00:00:00.000Z",
      },
    ])

    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      getCollections,
    })

    const response = await fetch(`${server.baseUrl}/api/collections`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          entryId: "entry_1",
          feedId: "feed_1",
          view: 1,
          createdAt: "2026-05-09T00:00:00.000Z",
        },
      ],
    })
    expect(getCollections).toHaveBeenCalledTimes(1)
  })

  it("broadcasts remote events to connected sse clients", async () => {
    const abortController = new AbortController()
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
    })

    const response = await fetch(`${server.baseUrl}/events`, {
      signal: abortController.signal,
    })
    expect(response.status).toBe(200)

    const reader = response.body!.getReader()
    const firstChunk = await readChunkWithTimeout(reader)
    expect(new TextDecoder().decode(firstChunk.value)).toContain("event: ready")

    RemoteServerManager.broadcast("entries.updated", {
      feedId: "feed_1",
    })

    const secondChunk = await readChunkWithTimeout(reader)
    const payload = new TextDecoder().decode(secondChunk.value)
    expect(payload).toContain("event: entries.updated")
    expect(payload).toContain('"feedId":"feed_1"')

    abortController.abort()
  })

  it("updates read status through the injected provider", async () => {
    const updateReadStatus = vi.fn().mockResolvedValue(undefined)
    const broadcast = vi.spyOn(RemoteServerManager, "broadcast")
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      getUnreadCounts: vi.fn().mockResolvedValue([]),
      updateReadStatus,
    })

    const response = await fetch(`${server.baseUrl}/api/entries/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entryIds: ["entry_1"],
        read: true,
      }),
    })

    expect(response.status).toBe(200)
    const responsePayload = await response.json()
    expect(responsePayload).toMatchObject({
      ok: true,
      batchId: expect.any(String),
      changeSet: { reason: "read", entryIds: ["entry_1"] },
    })
    expect(responsePayload.batchId).toBe(responsePayload.changeSet.batchId)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith("entries.updated", responsePayload.changeSet)
    broadcast.mockRestore()
    expect(updateReadStatus).toHaveBeenCalledWith({
      entryIds: ["entry_1"],
      read: true,
    })
  })

  it("updates entry star state through the injected provider", async () => {
    const updateEntryStar = vi.fn().mockResolvedValue(undefined)
    const broadcast = vi.spyOn(RemoteServerManager, "broadcast")
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      updateEntryStar,
    })

    const response = await fetch(`${server.baseUrl}/api/entries/star`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        entryId: "entry_1",
        starred: true,
        view: 1,
      }),
    })

    expect(response.status).toBe(200)
    const responsePayload = await response.json()
    expect(responsePayload).toMatchObject({
      ok: true,
      batchId: expect.any(String),
      changeSet: { reason: "collection", entryIds: ["entry_1"] },
    })
    expect(responsePayload.batchId).toBe(responsePayload.changeSet.batchId)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith("entries.updated", responsePayload.changeSet)
    broadcast.mockRestore()
    expect(updateEntryStar).toHaveBeenCalledWith({
      entryId: "entry_1",
      starred: true,
      view: 1,
    })
  })

  it("refreshes a feed through the injected provider", async () => {
    const refreshFeed = vi.fn().mockResolvedValue({
      feed: { id: "feed_1" },
      entriesCount: 2,
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      getUnreadCounts: vi.fn().mockResolvedValue([]),
      updateReadStatus: vi.fn().mockResolvedValue(undefined),
      refreshFeed,
    })

    const response = await fetch(`${server.baseUrl}/api/feeds/feed_1/refresh`, {
      method: "POST",
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      data: { feed: { id: "feed_1" }, entriesCount: 2 },
      batchId: expect.any(String),
      changeSet: {
        version: 1,
        batchId: expect.any(String),
        reason: "refresh",
        source: "remote",
        scope: "feeds",
        feedIds: ["feed_1"],
        feedId: "feed_1",
        refreshed: 1,
        failed: 0,
        completedAt: expect.any(Number),
      },
    })
    expect(payload.batchId).toBe(payload.changeSet.batchId)
    expect(refreshFeed).toHaveBeenCalledWith("feed_1")
  })

  it("keeps mutation response and SSE batch IDs identical with exact reason mapping", async () => {
    const abortController = new AbortController()
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      refreshFeed: vi.fn().mockResolvedValue({
        feed: { id: "feed_1" },
        entriesCount: 2,
      }),
    })
    const eventsResponse = await fetch(`${server.baseUrl}/events`, {
      signal: abortController.signal,
    })
    const reader = eventsResponse.body!.getReader()
    await readChunkWithTimeout(reader)

    const response = await fetch(`${server.baseUrl}/api/feeds/feed_1/refresh`, {
      method: "POST",
    })
    const payload = await response.json()
    const eventChunk = new TextDecoder().decode((await readChunkWithTimeout(reader)).value)
    const eventPayload = JSON.parse(eventChunk.match(/data: (.+)\n\n/)?.[1] ?? "{}")

    expect(eventChunk).toContain("event: entries.updated")
    expect(eventPayload.batchId).toBe(payload.batchId)
    expect(eventPayload).toEqual(payload.changeSet)
    expect(eventPayload).toMatchObject({ reason: "refresh", feedId: "feed_1" })
    abortController.abort()
  })

  it("refreshes all feeds through the injected provider", async () => {
    const refreshAllFeeds = vi.fn().mockResolvedValue({
      total: 4,
      successCount: 4,
      failCount: 0,
      results: [
        { feedId: "feed_1", ok: true },
        { feedId: "feed_2", ok: true },
        { feedId: "feed_3", ok: true },
        { feedId: "feed_4", ok: true },
      ],
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      getUnreadCounts: vi.fn().mockResolvedValue([]),
      updateReadStatus: vi.fn().mockResolvedValue(undefined),
      refreshFeed: vi.fn().mockResolvedValue(undefined),
      refreshAllFeeds,
    })

    const response = await fetch(`${server.baseUrl}/api/feeds/refresh-all`, {
      method: "POST",
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      data: {
        total: 4,
        successCount: 4,
        failCount: 0,
      },
      batchId: expect.any(String),
      changeSet: {
        reason: "refresh",
        feedIds: ["feed_1", "feed_2", "feed_3", "feed_4"],
        refreshed: 4,
        failed: 0,
      },
    })
    expect(payload.batchId).toBe(payload.changeSet.batchId)
    expect(refreshAllFeeds).toHaveBeenCalledTimes(1)
  })

  it("publishes one refresh-all event with only unique successful feed IDs and none on zero success", async () => {
    const broadcast = vi.spyOn(RemoteServerManager, "broadcast")
    const refreshAllFeeds = vi
      .fn()
      .mockResolvedValueOnce({
        total: 4,
        successCount: 2,
        failCount: 2,
        results: [
          { feedId: "feed_1", ok: true },
          { feedId: "feed_2", ok: false },
          { feedId: "feed_1", ok: true },
          { feedId: " feed_3 ", ok: true },
        ],
      })
      .mockResolvedValueOnce({
        total: 2,
        successCount: 0,
        failCount: 2,
        results: [
          { feedId: "feed_1", ok: false },
          { feedId: "feed_2", ok: false },
        ],
      })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      refreshAllFeeds,
    })

    const partialResponse = await fetch(`${server.baseUrl}/api/feeds/refresh-all`, {
      method: "POST",
    })
    const partialPayload = await partialResponse.json()

    expect(partialPayload.changeSet.feedIds).toEqual(["feed_1", "feed_3"])
    expect(partialPayload.batchId).toBe(partialPayload.changeSet.batchId)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith("entries.updated", partialPayload.changeSet)

    broadcast.mockClear()
    const zeroResponse = await fetch(`${server.baseUrl}/api/feeds/refresh-all`, {
      method: "POST",
    })
    const zeroPayload = await zeroResponse.json()

    expect(zeroPayload).toMatchObject({
      batchId: expect.any(String),
      changeSet: { reason: "refresh", feedIds: [], refreshed: 0, failed: 2 },
    })
    expect(zeroPayload.batchId).toBe(zeroPayload.changeSet.batchId)
    expect(broadcast).not.toHaveBeenCalled()
    broadcast.mockRestore()
  })

  it("creates a subscription through the injected provider", async () => {
    const createSubscription = vi.fn().mockResolvedValue({
      subscription: { id: "feed/feed_1", feedId: "feed_1", title: "Feed One" },
    })
    const broadcast = vi.spyOn(RemoteServerManager, "broadcast")
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      getUnreadCounts: vi.fn().mockResolvedValue([]),
      updateReadStatus: vi.fn().mockResolvedValue(undefined),
      refreshFeed: vi.fn().mockResolvedValue(undefined),
      refreshAllFeeds: vi.fn().mockResolvedValue(undefined),
      createSubscription,
    })

    const response = await fetch(`${server.baseUrl}/api/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://example.com/feed.xml",
        view: 1,
        title: "Feed One",
      }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      data: {
        subscription: { id: "feed/feed_1", feedId: "feed_1", title: "Feed One" },
      },
      batchId: expect.any(String),
      changeSet: { reason: "subscription", scope: "all" },
    })
    expect(payload.batchId).toBe(payload.changeSet.batchId)
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith("subscriptions.updated", payload.changeSet)
    broadcast.mockRestore()
    expect(createSubscription).toHaveBeenCalledWith({
      url: "https://example.com/feed.xml",
      view: 1,
      title: "Feed One",
    })
  })

  it("deletes a subscription through the injected provider", async () => {
    const deleteSubscription = vi.fn().mockResolvedValue(undefined)
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      getUnreadCounts: vi.fn().mockResolvedValue([]),
      updateReadStatus: vi.fn().mockResolvedValue(undefined),
      refreshFeed: vi.fn().mockResolvedValue(undefined),
      refreshAllFeeds: vi.fn().mockResolvedValue(undefined),
      deleteSubscription,
    })

    const response = await fetch(`${server.baseUrl}/api/subscriptions/feed%2Ffeed_1`, {
      method: "DELETE",
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toMatchObject({
      ok: true,
      batchId: expect.any(String),
      changeSet: { reason: "subscription", scope: "all" },
    })
    expect(payload.batchId).toBe(payload.changeSet.batchId)
    expect(deleteSubscription).toHaveBeenCalledWith("feed/feed_1")
  })

  it("updates a subscription through the injected provider", async () => {
    const updateSubscription = vi.fn().mockResolvedValue({
      id: "feed/feed_1",
      title: "Renamed Feed",
      category: "Work",
      view: 0,
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      listEntries: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }),
      getUnreadCounts: vi.fn().mockResolvedValue([]),
      updateReadStatus: vi.fn().mockResolvedValue(undefined),
      refreshFeed: vi.fn().mockResolvedValue(undefined),
      refreshAllFeeds: vi.fn().mockResolvedValue(undefined),
      updateSubscription,
    } as any)

    const response = await fetch(`${server.baseUrl}/api/subscriptions/feed%2Ffeed_1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Renamed Feed",
        category: "Work",
        view: 0,
      }),
    })

    expect(response.status).toBe(200)
    const responsePayload = await response.json()
    expect(responsePayload).toMatchObject({
      data: {
        id: "feed/feed_1",
        title: "Renamed Feed",
        category: "Work",
        view: 0,
      },
      batchId: expect.any(String),
      changeSet: { reason: "subscription", scope: "all" },
    })
    expect(responsePayload.batchId).toBe(responsePayload.changeSet.batchId)
    expect(updateSubscription).toHaveBeenCalledWith("feed/feed_1", {
      title: "Renamed Feed",
      category: "Work",
      view: 0,
    })
  })

  it("serves bootstrap, capabilities, and settings through injected providers", async () => {
    const bootstrap = {
      subscriptions: [],
      feeds: [],
      unread: [],
      collections: [],
      settings: { appearance: "system", rsshubCustomUrl: "" },
      capabilities: { auth: "none", pdfExport: true },
    }
    const getBootstrap = vi.fn().mockResolvedValue(bootstrap)
    const getCapabilities = vi.fn().mockReturnValue({ auth: "none", pdfExport: true })
    const getSettings = vi.fn().mockReturnValue({ appearance: "system", rsshubCustomUrl: "" })
    const updateSettings = vi
      .fn()
      .mockReturnValue({ appearance: "dark", rsshubCustomUrl: "https://rsshub.example" })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getBootstrap,
      getCapabilities,
      getSettings,
      updateSettings,
    })

    await expect(
      fetch(`${server.baseUrl}/api/bootstrap`).then((res) => res.json()),
    ).resolves.toEqual({
      data: {
        ...bootstrap,
        capabilities: { ...bootstrap.capabilities, privateLocalReading: true },
      },
    })
    expect(getBootstrap).toHaveBeenCalledTimes(1)
    await expect(
      fetch(`${server.baseUrl}/api/capabilities`).then((res) => res.json()),
    ).resolves.toEqual({
      data: { auth: "none", pdfExport: true },
    })
    const response = await fetch(`${server.baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appearance: "dark", rsshubCustomUrl: "https://rsshub.example" }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: { appearance: "dark", rsshubCustomUrl: "https://rsshub.example" },
    })
    expect(updateSettings).toHaveBeenCalledWith({
      appearance: "dark",
      rsshubCustomUrl: "https://rsshub.example",
    })
  })

  it("assembles one complete bootstrap envelope from the default providers", async () => {
    const subscriptions = [
      {
        id: "feed/feed_1",
        type: "feed" as const,
        feedId: "feed_1",
        listId: null,
        inboxId: null,
        userId: "local_user",
        view: 1,
        isPrivate: false,
        title: "Feed One",
        category: "Tech",
      },
    ]
    bootstrapProviders.listSubscriptions.mockResolvedValueOnce(subscriptions as never)
    bootstrapProviders.listUnreadCounts.mockResolvedValueOnce([{ id: "feed_1", count: 3 }])
    bootstrapProviders.listCollections.mockResolvedValueOnce([
      { entryId: "entry_1", feedId: "feed_1", view: 1 },
    ] as never)
    bootstrapProviders.getSettings.mockReturnValueOnce({
      appearance: "system",
      rsshubCustomUrl: "",
    })
    bootstrapProviders.getCapabilities.mockReturnValueOnce({
      auth: "none",
      pdfExport: true,
    } as never)

    const server = await RemoteServerManager.start({ host: "127.0.0.1", port: 0 })
    const response = await fetch(`${server.baseUrl}/api/bootstrap`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        subscriptions,
        feeds: [{ id: "feed_1", title: "Feed One", url: "" }],
        unread: [{ id: "feed_1", count: 3 }],
        collections: [{ entryId: "entry_1", feedId: "feed_1", view: 1 }],
        settings: { appearance: "system", rsshubCustomUrl: "" },
        capabilities: { auth: "none", pdfExport: true, privateLocalReading: true },
      },
    })
  })

  it("sanitizes bootstrap provider failures", async () => {
    const getBootstrap = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'select * from entries password="secret" /Users/private?token=hidden postgres://local',
        ),
      )
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getBootstrap,
    })

    const response = await fetch(`${server.baseUrl}/api/bootstrap?token=hidden`)
    const body = await response.text()

    expect(response.status).toBe(500)
    expect(body).toContain("REMOTE_BOOTSTRAP_FAILED")
    expect(body).not.toContain("select *")
    expect(body).not.toContain("secret")
    expect(body).not.toContain("/Users/private")
    expect(body).not.toContain("token=hidden")
    expect(body).not.toContain("postgres://")
  })

  it("supports batch subscription management routes", async () => {
    const batchUpdateSubscriptions = vi.fn().mockResolvedValue(undefined)
    const deleteSubscriptionsByTargets = vi.fn().mockResolvedValue(undefined)
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      batchUpdateSubscriptions,
      deleteSubscriptionsByTargets,
    })

    const patchResponse = await fetch(`${server.baseUrl}/api/subscriptions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedIds: ["feed_1", "feed_2"], category: "Work", view: 1 }),
    })
    expect(patchResponse.status).toBe(200)
    expect(batchUpdateSubscriptions).toHaveBeenCalledWith({
      feedIds: ["feed_1", "feed_2"],
      category: "Work",
      view: 1,
    })

    const deleteResponse = await fetch(`${server.baseUrl}/api/subscriptions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedIds: ["feed_1"] }),
    })
    expect(deleteResponse.status).toBe(200)
    expect(deleteSubscriptionsByTargets).toHaveBeenCalledWith({ feedIds: ["feed_1"] })
  })

  it("supports feed preview, rsshub, import/export, discover, and pdf routes", async () => {
    const previewFeed = vi.fn().mockResolvedValue({ feed: { id: "feed_1" } })
    const getRsshubConfig = vi.fn().mockReturnValue({ customUrl: "" })
    const setRsshubConfig = vi.fn().mockReturnValue({ customUrl: "https://rsshub.example" })
    const precheckRsshub = vi.fn().mockResolvedValue({ ok: true })
    const discover = vi.fn().mockResolvedValue([{ id: "trend_1" }])
    const exportData = vi.fn().mockResolvedValue({ version: 1, feeds: [] })
    const importData = vi.fn().mockResolvedValue({ feeds: 1 })
    const getEntry = vi.fn().mockResolvedValue({
      id: "entry_1",
      title: "Entry title",
      content: "<p>Entry body</p>",
      readabilityContent: null,
      author: "Author",
      publishedAt: 1_700_000_000_000,
      url: "https://example.com/entry",
    })
    const renderEntryPdf = vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7"))
    const broadcast = vi.spyOn(RemoteServerManager, "broadcast")
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getEntry,
      previewFeed,
      getRsshubConfig,
      setRsshubConfig,
      precheckRsshub,
      discover,
      exportData,
      importData,
      renderEntryPdf,
    })

    expect(
      await fetch(`${server.baseUrl}/api/feeds/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "rsshub://example/route" }),
      }).then((res) => res.status),
    ).toBe(200)
    expect(previewFeed).toHaveBeenCalledWith({ url: "rsshub://example/route" })

    await fetch(`${server.baseUrl}/api/rsshub/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customUrl: "https://rsshub.example" }),
    })
    expect(setRsshubConfig).toHaveBeenCalledWith({ customUrl: "https://rsshub.example" })

    await fetch(`${server.baseUrl}/api/rsshub/precheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "rsshub://example/route" }),
    })
    expect(precheckRsshub).toHaveBeenCalledWith({ url: "rsshub://example/route" })

    await fetch(`${server.baseUrl}/api/discover/trending/feeds?limit=10`)
    expect(discover).toHaveBeenCalledWith("/trending/feeds", { limit: "10" })

    await expect(fetch(`${server.baseUrl}/api/export`).then((res) => res.json())).resolves.toEqual({
      data: { version: 1, feeds: [] },
    })

    const importResponse = await fetch(`${server.baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, feeds: [] }),
    })
    const importPayload = await importResponse.json()
    expect(importPayload).toMatchObject({
      data: { feeds: 1 },
      batchId: expect.any(String),
      changeSet: { reason: "import", scope: "all" },
    })
    expect(importPayload.batchId).toBe(importPayload.changeSet.batchId)
    expect(broadcast).toHaveBeenCalledWith("entries.updated", importPayload.changeSet)
    broadcast.mockRestore()
    expect(importData).toHaveBeenCalledWith({ version: 1, feeds: [] })

    const pdfResponse = await fetch(`${server.baseUrl}/api/entries/entry_1/pdf`)
    expect(pdfResponse.status).toBe(200)
    expect(pdfResponse.headers.get("content-type")).toContain("application/pdf")
    expect(await pdfResponse.text()).toContain("%PDF-1.7")
    expect(getEntry).toHaveBeenCalledWith("entry_1")
    expect(renderEntryPdf).toHaveBeenCalledWith({
      title: "Entry title",
      contentHtml: "<p>Entry body</p>",
      author: "Author",
      publishedAt: expect.any(String),
      url: "https://example.com/entry",
    })
    expect(getRsshubConfig).not.toHaveBeenCalled()
  })

  it("returns a clear error when pdf export has no entry content", async () => {
    const getEntry = vi.fn().mockResolvedValue({
      id: "entry_1",
      title: "Entry title",
      content: "",
      readabilityContent: null,
      description: "",
    })
    const renderEntryPdf = vi.fn()
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getEntry,
      renderEntryPdf,
    })

    const response = await fetch(`${server.baseUrl}/api/entries/entry_1/pdf`)

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ error: "REMOTE_ENTRY_CONTENT_EMPTY" })
    expect(renderEntryPdf).not.toHaveBeenCalled()
  })
})
