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

  it("uses HTTP for remote entry listing and applies multi-feed filtering locally", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: "entry-1", title: "One", feedId: "feed-a", publishedAt: 30, read: false },
          { id: "entry-2", title: "Two", feedId: "feed-b", publishedAt: 20, read: false },
          { id: "entry-3", title: "Three", feedId: "feed-c", publishedAt: 10, read: false },
        ],
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    setRemoteRuntime(true)

    const entries = await runtimeClient.entries.list({
      feedIdList: ["feed-a", "feed-b"],
      read: false,
      limit: 10,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/entries?unreadOnly=1",
      expect.objectContaining({ headers: {} }),
    )
    expect(entries.map((entry) => entry.id)).toEqual(["entry-1", "entry-2"])
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
