// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@suhui/database/services/entry", () => ({
  EntryService: {
    patchMany: vi.fn(),
  },
}))

vi.mock("@suhui/database/services/feed", () => ({
  FeedService: {},
}))

vi.mock("@suhui/database/services/subscription", () => ({
  SubscriptionService: {
    deleteByTargets: vi.fn(),
    patch: vi.fn(),
    patchMany: vi.fn(),
  },
}))

const { runtimeClient } = await import("./client")

const setRemoteRuntime = (value: boolean) => {
  ;(window as any).__REMOTE_RUNTIME__ = value
}

const setIpc = (invoke: ReturnType<typeof vi.fn> | null) => {
  ;(window as any).electron = invoke ? { ipcRenderer: { invoke } } : undefined
}

const jsonResponse = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  })

describe("runtimeClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setRemoteRuntime(false)
    setIpc(null)
  })

  it("loads and validates metadata with one bootstrap request", async () => {
    const payload = {
      subscriptions: [],
      feeds: [],
      unread: [],
      collections: [],
      settings: { appearance: "system", rsshubCustomUrl: "" },
      capabilities: { pdfExport: true },
    }
    const fetchMock = vi.fn(async () => jsonResponse({ data: payload }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(runtimeClient.bootstrap.get()).resolves.toEqual(payload)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bootstrap",
      expect.objectContaining({ headers: {} }),
    )
  })

  it("rejects a malformed bootstrap envelope", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: {
          subscriptions: [],
          feeds: [],
          unread: [],
          collections: [],
          settings: { appearance: "system", rsshubCustomUrl: "" },
          capabilities: {},
        },
        extra: true,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(runtimeClient.bootstrap.get()).rejects.toThrow(
      "Invalid remote bootstrap: envelope",
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("sends one normalized HTTP query and returns the server page unchanged", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: "entry-1", title: "One", feedId: "feed-a", publishedAt: 30, read: false },
          { id: "entry-2", title: "Two", feedId: "feed-b", publishedAt: 20, read: false },
        ],
        page: { limit: 20, hasMore: true, nextCursor: "opaque-next" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    setRemoteRuntime(true)

    const page = await runtimeClient.entries.list({
      feedIdList: ["feed-a", "feed-b", "feed-a"],
      read: false,
      limit: 20,
      pageParam: "opaque-current",
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/entries?feedId=feed-a&feedId=feed-b&read=false&limit=20&cursor=opaque-current",
      expect.objectContaining({ headers: {} }),
    )
    expect((page as any).data.map((entry: { id: string }) => entry.id)).toEqual([
      "entry-1",
      "entry-2",
    ])
    expect((page as any).page).toEqual({
      limit: 20,
      hasMore: true,
      nextCursor: "opaque-next",
    })
  })

  it("sends one multi-feed IPC query and returns the server page unchanged", async () => {
    const invoke = vi.fn(async () => ({
      items: [{ id: "entry-1", title: "One", feedId: "feed-a", publishedAt: 30, read: false }],
      page: { limit: 20, hasMore: true, nextCursor: "opaque-next" },
    }))
    setIpc(invoke)

    const page = await runtimeClient.entries.list({
      feedIdList: ["feed-a", "feed-b", "feed-a"],
      limit: 20,
    })

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith("db.listEntries", {
      scope: { kind: "feeds", feedIds: ["feed-a", "feed-b"] },
      limit: 20,
    })
    expect((page as any).page.nextCursor).toBe("opaque-next")
  })

  it("keeps the non-runtime fallback bounded, opaque, and summary-only", async () => {
    const page = await runtimeClient.entries.list({
      limit: 1,
      localFallbackEntries: [
        {
          id: "e1",
          publishedAt: 20,
          insertedAt: 20,
          read: false,
          content: "body",
          readabilityContent: "readable",
        },
        { id: "e2", publishedAt: 10, insertedAt: 10, read: false, content: "older" },
      ] as any,
    })

    expect(page.data).toHaveLength(1)
    expect(page.data[0]).not.toHaveProperty("content")
    expect(page.data[0]).not.toHaveProperty("readabilityContent")
    expect(page.page.nextCursor).toMatch(/^memory-v1:/)
  })

  it("uses HTTP for remote subscription mutations", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { ok: true } }))
    vi.stubGlobal("fetch", fetchMock)
    setRemoteRuntime(true)

    await runtimeClient.subscriptions.create({
      url: "https://example.com/feed.xml",
      view: 1 as any,
      category: "News",
      title: "Example",
      isPrivate: false,
      hideFromTimeline: false,
      feedId: null,
      listId: undefined,
    })
    await runtimeClient.subscriptions.updateById("feed/feed-a", {
      title: "Renamed",
      category: "Tech",
      view: 1,
    })
    await runtimeClient.subscriptions.deleteByTargets({ feedIds: ["feed-a"] })
    await runtimeClient.subscriptions.batchUpdate({
      feedIds: ["feed-a", "feed-b"],
      category: null,
      view: 1,
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/subscriptions",
      expect.objectContaining({ method: "POST" }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/subscriptions/feed%2Ffeed-a",
      expect.objectContaining({ method: "PATCH" }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/subscriptions",
      expect.objectContaining({ method: "DELETE" }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/subscriptions",
      expect.objectContaining({ method: "PATCH" }),
    )
  })

  it("uses IPC for desktop runtime mutations", async () => {
    const invoke = vi.fn(async () => ({ ok: true }))
    setIpc(invoke)

    await runtimeClient.subscriptions.create({
      url: "https://example.com/feed.xml",
      view: 1 as any,
      category: null,
      title: null,
      isPrivate: false,
      hideFromTimeline: false,
      feedId: null,
      listId: undefined,
    })
    await runtimeClient.subscriptions.updateById("feed/feed-a", { title: "Renamed" })
    await runtimeClient.entries.updateReadStatus({ entryIds: ["entry-1"], read: true })

    expect(invoke).toHaveBeenCalledWith(
      "db.addFeed",
      expect.objectContaining({ url: "https://example.com/feed.xml" }),
    )
    expect(invoke).toHaveBeenCalledWith("db.updateSubscription", "feed/feed-a", {
      title: "Renamed",
    })
    expect(invoke).toHaveBeenCalledWith("db.updateReadStatus", {
      entryIds: ["entry-1"],
      read: true,
    })
  })
})
