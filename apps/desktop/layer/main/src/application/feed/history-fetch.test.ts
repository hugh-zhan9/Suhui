import { PassThrough } from "node:stream"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchHistoryPage,
  HISTORY_MAX_PAGE_BYTES,
  HISTORY_REQUEST_TIMEOUT_MS,
  isPublicHistoryAddress,
  validateHistoryUrl,
} from "./history-fetch"

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }))
vi.mock("node:http", () => ({ request: mocks.request }))
vi.mock("node:https", () => ({ request: mocks.request }))

const respond = (status = 200, headers = {}, body = "<html>article</html>") => {
  mocks.request.mockImplementationOnce((_url, _options, callback) => {
    const req = { on: vi.fn(), end: () => {} }
    req.end = () => {
      const res = Object.assign(new PassThrough(), { statusCode: status, headers })
      callback(res)
      res.end(body)
    }
    return req
  })
}

beforeEach(() => {
  mocks.lookup.mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
  mocks.request.mockReset()
})
afterEach(() => vi.useRealTimers())

describe("history public HTTP boundary", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.2",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2001:0db8::1",
    "2001::1",
    "2001:0000:1234::1",
    "198.18.0.1",
    "203.0.113.1",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicHistoryAddress(address)).toBe(false)
  })
  it("rejects alternate origin, credentials and private literals", () => {
    for (const url of [
      "http://127.0.0.1/",
      "https://user:pass@blog.test/",
      "file:///etc/hosts",
      "https://elsewhere.test/",
    ]) {
      expect(() => validateHistoryUrl(url, "https://blog.test")).toThrow()
    }
  })
  it("pins the socket lookup to all validated addresses and carries no cookies", async () => {
    respond()
    expect(await fetchHistoryPage("https://blog.test/", "https://blog.test")).toMatchObject({
      html: "<html>article</html>",
    })
    const options = mocks.request.mock.calls[0]![1]
    const callback = vi.fn()
    options.lookup("blog.test", { all: true }, callback)
    expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }])
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
    expect(options.headers).not.toHaveProperty("Cookie")
    expect(options.agent).toBe(false)
  })
  it("rejects mixed public/private DNS results before opening a socket", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ])
    await expect(fetchHistoryPage("https://blog.test/", "https://blog.test")).rejects.toThrow(
      "公网",
    )
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it("validates every redirect and does not request another origin", async () => {
    respond(302, { location: "http://127.0.0.1/secrets" })
    await expect(fetchHistoryPage("https://blog.test/", "https://blog.test")).rejects.toThrow(
      "同一公开站点",
    )
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it("rejects DNS rebinding on a same-origin redirect", async () => {
    respond(302, { location: "/next" })
    mocks.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }])
    await expect(fetchHistoryPage("https://blog.test/", "https://blog.test")).rejects.toThrow(
      "公网",
    )
    expect(mocks.request).toHaveBeenCalledTimes(1)
  })
  it("bounds response size", async () => {
    respond(200, {}, "x".repeat(HISTORY_MAX_PAGE_BYTES + 1))
    await expect(fetchHistoryPage("https://blog.test/", "https://blog.test")).rejects.toThrow(
      "2 MiB",
    )
  })
  it("times out even when DNS never settles", async () => {
    vi.useFakeTimers()
    mocks.lookup.mockReturnValue(new Promise(() => {}))
    const result = expect(
      fetchHistoryPage("https://blog.test/", "https://blog.test"),
    ).rejects.toThrow("超时")
    await vi.advanceTimersByTimeAsync(HISTORY_REQUEST_TIMEOUT_MS)
    await result
    expect(mocks.request).not.toHaveBeenCalled()
  })
})

it("rejects malformed redirect locations as request errors", async () => {
  respond(302, { location: "http://[" })
  await expect(fetchHistoryPage("https://blog.test/", "https://blog.test")).rejects.toThrow()
})
