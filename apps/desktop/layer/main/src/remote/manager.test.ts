import { afterEach, describe, expect, it, vi } from "vitest"

import { RemoteServerManager } from "./manager"

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
    expect(getEntries).toHaveBeenCalledWith("feed_1")
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
})
