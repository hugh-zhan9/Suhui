import { afterEach, describe, expect, it, vi } from "vitest"

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

vi.mock("~/application/import-export/service", () => ({
  importExportApplicationService: {
    exportData: vi.fn().mockResolvedValue({ version: 1 }),
    importData: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("~/application/collection/service", () => ({
  collectionApplicationService: {
    listCollections: vi.fn().mockResolvedValue([]),
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
    getCapabilities: vi.fn().mockReturnValue({ auth: "none" }),
    getSettings: vi.fn().mockReturnValue({ appearance: "system", rsshubCustomUrl: "" }),
    updateSettings: vi.fn().mockImplementation((input) => ({
      appearance: input.appearance || "system",
      rsshubCustomUrl: input.rsshubCustomUrl || "",
    })),
  },
}))

vi.mock("~/application/subscription/service", () => ({
  subscriptionApplicationService: {
    listSubscriptions: vi.fn().mockResolvedValue([]),
    createSubscription: vi.fn().mockResolvedValue({}),
    deleteSubscription: vi.fn().mockResolvedValue(undefined),
    deleteSubscriptionsByTargets: vi.fn().mockResolvedValue(undefined),
    updateSubscription: vi.fn().mockResolvedValue({}),
    batchUpdateSubscriptions: vi.fn().mockResolvedValue(undefined),
  },
}))

import { RemoteServerManager } from "./manager"
import { agentReadStatusMaxEntryIds } from "~/application/agent/types"

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
      getEntries: vi.fn().mockResolvedValue([]),
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

  it("serves entries from the injected provider", async () => {
    const getEntries = vi.fn().mockResolvedValue([
      {
        id: "entry_1",
        feedId: "feed_1",
        title: "Entry One",
        publishedAt: 1710000000000,
      },
    ])

    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getEntries,
    })

    const response = await fetch(`${server.baseUrl}/api/entries?feedId=feed_1`)
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
    })
    expect(getEntries).toHaveBeenCalledWith({
      feedId: "feed_1",
      unreadOnly: false,
    })
  })

  it("serves unread-only entries from the injected provider", async () => {
    const getEntries = vi.fn().mockResolvedValue([
      {
        id: "entry_2",
        feedId: "feed_1",
        title: "Unread Entry",
        read: false,
        publishedAt: 1710000001000,
      },
    ])

    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getEntries,
    })

    const response = await fetch(`${server.baseUrl}/api/entries?feedId=feed_1&unreadOnly=1`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: "entry_2",
          feedId: "feed_1",
          title: "Unread Entry",
          read: false,
          publishedAt: 1710000001000,
        },
      ],
    })
    expect(getEntries).toHaveBeenCalledWith({
      feedId: "feed_1",
      unreadOnly: true,
    })
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
    await expect(response.json()).resolves.toEqual({
      data: {
        updated: 2,
        read: true,
      },
    })
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
      getEntries: vi.fn().mockResolvedValue([]),
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

  it("serves unread counts from the injected provider", async () => {
    const getUnreadCounts = vi.fn().mockResolvedValue([
      { id: "feed_1", count: 3 },
      { id: "feed_2", count: 1 },
    ])

    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getEntries: vi.fn().mockResolvedValue([]),
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
      getEntries: vi.fn().mockResolvedValue([]),
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
      getEntries: vi.fn().mockResolvedValue([]),
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
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getEntries: vi.fn().mockResolvedValue([]),
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
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(updateReadStatus).toHaveBeenCalledWith({
      entryIds: ["entry_1"],
      read: true,
    })
  })

  it("updates entry star state through the injected provider", async () => {
    const updateEntryStar = vi.fn().mockResolvedValue(undefined)
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getEntries: vi.fn().mockResolvedValue([]),
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
    await expect(response.json()).resolves.toEqual({ ok: true })
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
      getEntries: vi.fn().mockResolvedValue([]),
      getUnreadCounts: vi.fn().mockResolvedValue([]),
      updateReadStatus: vi.fn().mockResolvedValue(undefined),
      refreshFeed,
    })

    const response = await fetch(`${server.baseUrl}/api/feeds/feed_1/refresh`, {
      method: "POST",
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        feed: { id: "feed_1" },
        entriesCount: 2,
      },
    })
    expect(refreshFeed).toHaveBeenCalledWith("feed_1")
  })

  it("refreshes all feeds through the injected provider", async () => {
    const refreshAllFeeds = vi.fn().mockResolvedValue({
      total: 4,
      successCount: 4,
      failCount: 0,
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getEntries: vi.fn().mockResolvedValue([]),
      getUnreadCounts: vi.fn().mockResolvedValue([]),
      updateReadStatus: vi.fn().mockResolvedValue(undefined),
      refreshFeed: vi.fn().mockResolvedValue(undefined),
      refreshAllFeeds,
    })

    const response = await fetch(`${server.baseUrl}/api/feeds/refresh-all`, {
      method: "POST",
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        total: 4,
        successCount: 4,
        failCount: 0,
      },
    })
    expect(refreshAllFeeds).toHaveBeenCalledTimes(1)
  })

  it("creates a subscription through the injected provider", async () => {
    const createSubscription = vi.fn().mockResolvedValue({
      subscription: { id: "feed/feed_1", feedId: "feed_1", title: "Feed One" },
    })
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getEntries: vi.fn().mockResolvedValue([]),
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
    await expect(response.json()).resolves.toEqual({
      data: {
        subscription: { id: "feed/feed_1", feedId: "feed_1", title: "Feed One" },
      },
    })
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
      getEntries: vi.fn().mockResolvedValue([]),
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
    await expect(response.json()).resolves.toEqual({ ok: true })
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
      getEntries: vi.fn().mockResolvedValue([]),
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
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "feed/feed_1",
        title: "Renamed Feed",
        category: "Work",
        view: 0,
      },
    })
    expect(updateSubscription).toHaveBeenCalledWith("feed/feed_1", {
      title: "Renamed Feed",
      category: "Work",
      view: 0,
    })
  })

  it("serves bootstrap, capabilities, and settings through injected providers", async () => {
    const getBootstrap = vi.fn().mockResolvedValue({ subscriptions: [], unread: [] })
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
      data: { subscriptions: [], unread: [] },
    })
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

    await fetch(`${server.baseUrl}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, feeds: [] }),
    })
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
