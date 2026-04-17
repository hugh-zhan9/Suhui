import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchFeedUrl = vi.fn()

vi.mock("../ipc/services/feed-fetch", () => ({
  fetchFeedUrl,
}))

vi.mock("~/lib/store", () => ({
  store: {
    get: vi.fn(() => ""),
  },
}))

vi.mock("~/manager/db", () => ({
  DBManager: {
    getDB: vi.fn(),
  },
}))

vi.mock("~/manager/sync-applier", () => ({
  drainPendingOps: vi.fn(),
}))

vi.mock("~/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}))

describe("FeedRefreshService.buildPreviewData", () => {
  beforeEach(() => {
    fetchFeedUrl.mockReset()
  })

  it("reuses the shared feed fetch adapter for refresh preview data", async () => {
    fetchFeedUrl.mockResolvedValue({
      body: `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Verne in GitHub</title><link href="https://blog.einverne.info/" rel="alternate" /><entry><title>Entry 1</title><link href="https://blog.einverne.info/post/1" rel="alternate" /><id>entry-1</id><updated>2026-04-08T00:00:00-05:00</updated><content type="html">hello</content></entry></feed>`,
      finalUrl: "https://blog.einverne.info/feed.xml",
      redirectChain: [],
      statusCode: 200,
    })

    const { FeedRefreshService } = await import("./feed-refresh")
    const preview = await FeedRefreshService.buildPreviewData("https://blog.einverne.info/feed.xml")

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
