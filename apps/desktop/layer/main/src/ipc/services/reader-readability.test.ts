import { Readability } from "@mozilla/readability"
import { readability } from "@suhui/readability"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { logger } from "~/logger"

import { readArticleWithDiagnostics } from "./reader-readability"

vi.mock("~/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))
const url = "https://user:secret@private.example/article?token=private-token"
const html = `<html><head><title>Private title</title></head><body><article><p>${"Private article text. ".repeat(80)}</p></article></body></html>`
const records = () =>
  [...vi.mocked(logger.info).mock.calls, ...vi.mocked(logger.warn).mock.calls].map((call) =>
    JSON.parse(String(call[1])),
  )

describe("readability diagnostics", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("records phases, status, content size and correlation without logging article or URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html)))
    const parsed = await readArticleWithDiagnostics(url, "entry-1")
    expect(parsed?.content).toContain("Private article text")
    expect(records().map((r) => r.phase)).toEqual([
      "request",
      "reading_response",
      "decoding",
      "extracting",
      "completed",
    ])
    expect(records().at(-1)).toMatchObject({
      entryId: "entry-1",
      httpStatus: 200,
      characters: parsed!.content!.length,
      elapsedMs: expect.any(Number),
    })
    expect(new Set(records().map((r) => r.traceId)).size).toBe(1)
    expect(JSON.stringify(records())).not.toMatch(/secret|private|Private|https:/)
  })

  it("identifies fetch cause codes and returns a safe diagnostic ID without retrying", async () => {
    const error = new TypeError(`fetch failed for ${url}`, {
      cause: new AggregateError(
        [
          Object.assign(new Error("private-token"), { code: "ENOTFOUND" }),
          Object.assign(new Error(url), { code: "ECONNRESET" }),
        ],
        "network attempts failed",
      ),
    })
    const fetch = vi.fn().mockRejectedValue(error)
    vi.stubGlobal("fetch", fetch)
    let message = ""
    try {
      await readArticleWithDiagnostics(url, "entry-1")
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toMatch(/READABILITY_FAILED phase=request .*ENOTFOUND.*ECONNRESET.*traceId=/)
    expect(records().at(-1)).toMatchObject({
      event: "failed",
      phase: "request",
      errorCodes: ["ENOTFOUND", "ECONNRESET"],
    })
    expect(message).toContain(records().at(-1).traceId)
    expect(JSON.stringify(records()) + message).not.toMatch(/private|secret|https:/)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each(["reading_response", "extracting"])(
    "distinguishes %s failure after response headers",
    async (phase) => {
      const response = new Response(html, { status: 503 })
      const error = new RangeError("private body")
      if (phase === "reading_response") vi.spyOn(response, "arrayBuffer").mockRejectedValue(error)
      else
        vi.spyOn(Readability.prototype, "parse").mockImplementation(() => {
          throw error
        })
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
      await expect(readArticleWithDiagnostics(url)).rejects.toThrow(`phase=${phase}`)
      expect(records().at(-1)).toMatchObject({
        event: "failed",
        phase,
        httpStatus: 503,
        errorNames: ["RangeError"],
      })
    },
  )

  it("keeps the original result and original exception when diagnostics fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html)))
    vi.mocked(logger.info).mockImplementationOnce(() => {
      throw new Error("disk full")
    })
    expect((await readArticleWithDiagnostics(url))?.content).toContain("Private article text")
    const error = new Error("original failure")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error))
    await expect(
      readability(url, () => {
        throw new Error("logger failed")
      }),
    ).rejects.toBe(error)
  })

  it("records an empty parse without changing its existing null result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html><body></body></html>")))
    await expect(readArticleWithDiagnostics(url)).resolves.toBeNull()
    expect(records().at(-1)).toMatchObject({ event: "completed", characters: 0 })
  })
})
