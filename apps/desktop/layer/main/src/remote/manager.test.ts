import { afterEach, describe, expect, it, vi } from "vitest"

import { RemoteServerManager } from "./manager"

describe("RemoteServerManager", () => {
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

  it("serves a remote browser shell and client script", async () => {
    const abortController = new AbortController()
    const server = await RemoteServerManager.start({
      host: "127.0.0.1",
      port: 0,
      getSubscriptions: vi.fn().mockResolvedValue([]),
      getEntries: vi.fn().mockResolvedValue([]),
    })

    const htmlResponse = await fetch(`${server.baseUrl}/`)
    expect(htmlResponse.status).toBe(200)
    expect(htmlResponse.headers.get("content-type")).toContain("text/html")
    const html = await htmlResponse.text()
    expect(html).toContain('id="remote-root"')
    expect(html).toContain('src="/remote.js"')

    const jsResponse = await fetch(`${server.baseUrl}/remote.js`)
    expect(jsResponse.status).toBe(200)
    expect(jsResponse.headers.get("content-type")).toContain("javascript")
    const js = await jsResponse.text()
    expect(js).toContain("/api/subscriptions")
    expect(js).toContain("/api/entries")
    expect(js).toContain("/events")
    expect(js).toContain("remote-root")

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
})
