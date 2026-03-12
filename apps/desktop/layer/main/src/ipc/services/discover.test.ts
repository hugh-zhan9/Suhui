import { describe, expect, it, vi } from "vitest"

vi.mock("~/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}))

import { DISCOVER_PROXY_BASE_URL, requestDiscoverJSON } from "./discover-proxy"

describe("discover ipc service", () => {
  it("应代理 trending 请求并返回 JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: [{ feedId: "1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const result = await requestDiscoverJSON("/trending/feeds", { limit: 1 }, fetcher)

    expect(fetcher).toHaveBeenCalledWith(`${DISCOVER_PROXY_BASE_URL}/trending/feeds?limit=1`)
    expect(result).toEqual({ code: 0, data: [{ feedId: "1" }] })
  })

  it("应在 discover 请求失败时抛出包含 URL 的错误", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("forbidden", {
        status: 403,
        headers: { "content-type": "text/plain" },
        statusText: "Forbidden",
      }),
    )

    await expect(
      requestDiscoverJSON("/discover/rsshub", { categories: "popular" }, fetcher),
    ).rejects.toThrowError(/discover proxy failed: 403 .*\/discover\/rsshub\?categories=popular/)
  })
})
