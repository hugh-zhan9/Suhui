import { session } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchFeedUrl } from "./feed-fetch"

vi.mock("electron", () => ({
  session: {
    defaultSession: {
      fetch: vi.fn(),
    },
  },
}))

describe("fetchFeedUrl", () => {
  const fetchMock = vi.mocked(session.defaultSession.fetch)

  beforeEach(() => {
    vi.useRealTimers()
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns body, finalUrl and status for successful fetches", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue("<feed />"),
      url: "https://blog.einverne.info/feed.xml",
    } as any)

    await expect(
      fetchFeedUrl("https://blog.einverne.info/feed.xml", { timeoutMs: 1000 }),
    ).resolves.toEqual({
      body: "<feed />",
      finalUrl: "https://blog.einverne.info/feed.xml",
      redirectChain: [],
      statusCode: 200,
    })
  })

  it("follows redirects manually and records redirectChain", async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: "/atom.xml" }),
        text: vi.fn(),
        url: "https://blog.einverne.info/feed.xml",
      } as any)
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers(),
        text: vi.fn().mockResolvedValue("<feed />"),
        url: "https://blog.einverne.info/atom.xml",
      } as any)

    await expect(
      fetchFeedUrl("https://blog.einverne.info/feed.xml", { timeoutMs: 1000 }),
    ).resolves.toEqual({
      body: "<feed />",
      finalUrl: "https://blog.einverne.info/atom.xml",
      redirectChain: ["https://blog.einverne.info/atom.xml"],
      statusCode: 200,
    })
  })

  it("falls back to automatic redirects when Electron cancels manual redirects", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Redirect was cancelled")).mockResolvedValueOnce({
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue("<feed />"),
      url: "https://www.gugegt.com/feed/",
    } as any)

    await expect(fetchFeedUrl("https://www.gugegt.com/feed", { timeoutMs: 1000 })).resolves.toEqual(
      {
        body: "<feed />",
        finalUrl: "https://www.gugegt.com/feed/",
        redirectChain: ["https://www.gugegt.com/feed/"],
        statusCode: 200,
      },
    )

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://www.gugegt.com/feed",
      expect.objectContaining({ redirect: "manual" }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://www.gugegt.com/feed",
      expect.objectContaining({ redirect: "follow" }),
    )
  })

  it("times out unresolved requests", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url, init) => {
      const signal = init?.signal as AbortSignal
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason))
      }) as any
    })

    const pending = fetchFeedUrl("https://blog.einverne.info/feed.xml", { timeoutMs: 500 })
    const expectation = expect(pending).rejects.toThrow("Feed request timed out after 500ms")
    await vi.advanceTimersByTimeAsync(500)
    await expectation
  })
})

describe("瞬时连接错误重试", () => {
  const fetchMock = vi.mocked(session.defaultSession.fetch)

  beforeEach(() => {
    vi.useRealTimers()
    fetchMock.mockReset()
  })

  const okResponse = (body: string) =>
    ({
      status: 200,
      headers: new Headers({ "content-type": "application/atom+xml" }),
      text: vi.fn().mockResolvedValue(body),
      url: "https://example.com/atom.xml",
    }) as any

  it("连接被关闭后重试一次并成功", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("net::ERR_CONNECTION_CLOSED"))
      .mockResolvedValueOnce(okResponse("<feed />"))

    const result = await fetchFeedUrl("https://example.com/atom.xml", { timeoutMs: 1000 })

    expect(result.body).toBe("<feed />")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("重试后仍失败则抛出原错误", async () => {
    fetchMock.mockRejectedValue(new Error("net::ERR_CONNECTION_RESET"))

    await expect(fetchFeedUrl("https://example.com/atom.xml", { timeoutMs: 1000 })).rejects.toThrow(
      "ERR_CONNECTION_RESET",
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(["HTTP 404", "net::ERR_NAME_NOT_RESOLVED", "Feed request timed out after 1000ms"])(
    "不重试非瞬时错误：%s",
    async (message) => {
      fetchMock.mockRejectedValue(new Error(message))

      await expect(
        fetchFeedUrl("https://example.com/atom.xml", { timeoutMs: 1000 }),
      ).rejects.toThrow()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )
})
