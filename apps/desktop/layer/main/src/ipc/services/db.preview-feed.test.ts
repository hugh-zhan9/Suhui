import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchFeedUrl = vi.fn()
const buildPreviewDiagnostics = vi.fn()

vi.mock("electron", () => ({
  session: {
    defaultSession: {
      resolveProxy: vi.fn(async () => "DIRECT"),
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

vi.mock("./feed-fetch", () => ({
  fetchFeedUrl,
}))

vi.mock("./preview-feed-diagnostics", () => ({
  buildPreviewDiagnostics,
}))

vi.mock("~/lib/store", () => ({
  store: {
    get: vi.fn(() => ""),
  },
}))

vi.mock("~/manager/db", () => ({
  DBManager: {
    waitUntilUsable: vi.fn(),
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

vi.mock("~/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}))

vi.mock("~/manager/refresh-audit-log", () => ({
  appendRefreshAuditTrace: vi.fn(),
}))

vi.mock("~/manager/local-feed-refresh-events", () => ({
  broadcastLocalFeedRefreshCompleted: vi.fn(),
}))

describe("DbService.previewFeed", () => {
  beforeEach(() => {
    fetchFeedUrl.mockReset()
    buildPreviewDiagnostics.mockReset()
    buildPreviewDiagnostics.mockResolvedValue({})
  })

  it("builds preview data from the shared feed fetch adapter", async () => {
    fetchFeedUrl.mockResolvedValue({
      body: `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Verne in GitHub</title><link href="https://blog.einverne.info/" rel="alternate" /><entry><title>Entry 1</title><link href="https://blog.einverne.info/post/1" rel="alternate" /><id>entry-1</id><updated>2026-04-08T00:00:00-05:00</updated><content type="html">hello</content></entry></feed>`,
      finalUrl: "https://blog.einverne.info/feed.xml",
      redirectChain: [],
      statusCode: 200,
    })

    const { DbService } = await import("./db")
    const service = new DbService()

    const preview = await service.previewFeed({} as any, {
      url: "https://blog.einverne.info/feed.xml",
    })

    expect(fetchFeedUrl).toHaveBeenCalledWith(
      "https://blog.einverne.info/feed.xml",
      expect.objectContaining({
        timeoutMs: 30000,
      }),
    )
    expect(preview.feed.title).toBe("Verne in GitHub")
    expect(preview.entries).toHaveLength(1)
  })
})
