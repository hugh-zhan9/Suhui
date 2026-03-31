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
})
