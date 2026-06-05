import { describe, expect, it, vi } from "vitest"

import { fetchAgentJson } from "./http.js"
import { CliError, exitCodes } from "./types.js"

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init,
  })

describe("fetchAgentJson", () => {
  it("returns the data envelope from a successful response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { ok: true } }))

    await expect(
      fetchAgentJson("http://127.0.0.1:41595", "/api/agent/feeds", { fetchImpl }),
    ).resolves.toEqual({ ok: true })

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:41595/api/agent/feeds",
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("maps API not found errors to exit code 3", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: "SUHUI_ENTRY_NOT_FOUND", message: "Entry not found" } },
        { status: 404 },
      ),
    )

    await expect(
      fetchAgentJson("http://127.0.0.1:41595", "/api/agent/entries/missing", { fetchImpl }),
    ).rejects.toMatchObject({
      code: "SUHUI_ENTRY_NOT_FOUND",
      exitCode: exitCodes.notFound,
      message: "Entry not found",
    })
  })

  it("preserves remote API validation error codes", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { error: { code: "SUHUI_INVALID_ENTRY_IDS", message: "entryIds must not be empty" } },
        { status: 400 },
      ),
    )

    await expect(
      fetchAgentJson("http://127.0.0.1:41595", "/api/agent/entries/read", {
        method: "POST",
        body: { entryIds: [], read: true },
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "SUHUI_INVALID_ENTRY_IDS",
      exitCode: exitCodes.error,
      message: "entryIds must not be empty",
    })
  })

  it("maps network failures and timeouts to remote unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })

    await expect(
      fetchAgentJson("http://127.0.0.1:41595", "/api/agent/feeds", { fetchImpl }),
    ).rejects.toMatchObject({
      code: "SUHUI_REMOTE_UNAVAILABLE",
      exitCode: exitCodes.remoteUnavailable,
    })
  })

  it("maps unexpected response shapes to exit code 4", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] }))

    const result = fetchAgentJson("http://127.0.0.1:41595", "/api/agent/feeds", { fetchImpl })

    await expect(result).rejects.toBeInstanceOf(CliError)
    await expect(result).rejects.toMatchObject({
      code: "SUHUI_UNEXPECTED_RESPONSE",
      exitCode: exitCodes.unexpectedResponse,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
