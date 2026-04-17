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
