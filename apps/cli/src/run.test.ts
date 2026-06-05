import { describe, expect, it, vi } from "vitest"

import { runCli } from "./run.js"
import { exitCodes } from "./types.js"

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init,
  })

const entry = {
  id: "entry-1",
  feedId: "feed-1",
  feedTitle: "Example Feed",
  title: "Example Post",
  url: "https://example.com/post",
  author: "Ada",
  publishedAt: 1710000000000,
  publishedAtIso: "2024-03-09T16:00:00.000Z",
  insertedAt: 1710000001000,
  insertedAtIso: "2024-03-09T16:00:01.000Z",
  read: false,
}

describe("runCli", () => {
  it("prints markdown entries list by default", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        data: { items: [entry], page: { limit: 20, nextCursor: null, hasMore: false } },
      }),
    )

    const result = await runCli({ argv: ["entries", "list"], env: {}, fetch })

    expect(result).toMatchObject({ exitCode: exitCodes.success, stderr: "" })
    expect(result.stdout).toContain("# Suhui Entries")
    expect(result.stdout).toContain("## Example Post")
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:41595/api/agent/entries",
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("encodes list query parameters and prints explicit JSON", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        data: { items: [], page: { limit: 5, nextCursor: "cursor", hasMore: true } },
      }),
    )

    const result = await runCli({
      argv: [
        "entries",
        "list",
        "--feed",
        "feed 1",
        "--unread",
        "--limit",
        "5",
        "--cursor",
        "cursor/value",
        "--with-summary",
        "--format",
        "json",
      ],
      env: {},
      fetch,
    })

    expect(result.exitCode).toBe(exitCodes.success)
    expect(JSON.parse(result.stdout)).toEqual({
      items: [],
      page: { limit: 5, nextCursor: "cursor", hasMore: true },
    })
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:41595/api/agent/entries?feedId=feed+1&read=false&limit=5&cursor=cursor%2Fvalue&withSummary=true",
      expect.any(Object),
    )
  })

  it("gets an entry detail and applies content formatting options", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        data: {
          ...entry,
          content: "<p>Full content</p>",
          contentSource: "content",
          description: "Summary content",
        },
      }),
    )

    const result = await runCli({
      argv: ["entries", "get", "entry/1", "--content", "summary", "--max-chars", "7"],
      env: {},
      fetch,
    })

    expect(result.exitCode).toBe(exitCodes.success)
    expect(result.stdout).toContain("Summary")
    expect(result.stdout).toContain("[Content truncated to 7 characters]")
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:41595/api/agent/entries/entry%2F1",
      expect.any(Object),
    )
  })

  it("lists feeds", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        data: {
          items: [
            {
              id: "feed-1",
              subscriptionId: "feed/feed-1",
              title: "Example Feed",
              url: "https://example.com/rss.xml",
              siteUrl: "https://example.com",
              category: "Tech",
              unreadCount: 3,
            },
          ],
        },
      }),
    )

    const result = await runCli({ argv: ["feeds", "list"], env: {}, fetch })

    expect(result.exitCode).toBe(exitCodes.success)
    expect(result.stdout).toContain("# Suhui Feeds")
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:41595/api/agent/feeds", expect.any(Object))
  })

  it("accepts a leading package-manager argument separator", async () => {
    const fetch = vi.fn(async () => jsonResponse({ data: { items: [] } }))

    const result = await runCli({ argv: ["--", "feeds", "list"], env: {}, fetch })

    expect(result.exitCode).toBe(exitCodes.success)
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:41595/api/agent/feeds", expect.any(Object))
  })

  it("marks entries read and unread", async () => {
    const fetch = vi.fn(async () => jsonResponse({ data: { updated: 2, read: true } }))

    const result = await runCli({
      argv: ["entries", "mark-read", "entry-1", "entry-2"],
      env: {},
      fetch,
    })

    expect(result).toMatchObject({ exitCode: exitCodes.success, stderr: "" })
    expect(result.stdout).toBe("Updated 2 entries to read.\n")
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:41595/api/agent/entries/read",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ entryIds: ["entry-1", "entry-2"], read: true }),
      }),
    )
  })

  it("returns usage errors on stderr with exit code 1", async () => {
    const result = await runCli({ argv: ["entries", "list", "--read", "--unread"], env: {} })

    expect(result).toMatchObject({
      exitCode: exitCodes.error,
      stdout: "",
    })
    expect(result.stderr).toContain("Error [SUHUI_USAGE_ERROR]:")
  })

  it("preserves remote API errors and JSON error formatting", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(
        { error: { code: "SUHUI_ENTRY_NOT_FOUND", message: "Entry not found" } },
        { status: 404 },
      ),
    )

    const result = await runCli({
      argv: ["--format", "json", "entries", "get", "missing"],
      env: {},
      fetch,
    })

    expect(result.exitCode).toBe(exitCodes.notFound)
    expect(result.stdout).toBe("")
    expect(JSON.parse(result.stderr)).toEqual({
      error: { code: "SUHUI_ENTRY_NOT_FOUND", message: "Entry not found" },
    })
  })

  it("maps unexpected non-Cli errors to exit code 1", async () => {
    const result = await runCli({
      argv: ["entries", "list"],
      env: {},
      fetch: async () => {
        throw new Error("boom")
      },
    })

    expect(result.exitCode).toBe(exitCodes.error)
    expect(result.stderr).toContain("boom")
  })

  it.each([
    [
      "entries list",
      ["entries", "list"],
      { items: null, page: { limit: 20, nextCursor: null, hasMore: false } },
    ],
    [
      "entries get",
      ["entries", "get", "entry-1"],
      { ...entry, content: null, contentSource: "content", description: null },
    ],
    ["feeds list", ["feeds", "list"], { items: [{ id: "feed-1" }] }],
    ["read status", ["entries", "mark-read", "entry-1"], { updated: "1", read: true }],
  ])("maps malformed %s success data to exit code 4", async (_name, argv, data) => {
    const fetch = vi.fn(async () => jsonResponse({ data }))

    const result = await runCli({ argv, env: {}, fetch })

    expect(result).toMatchObject({
      exitCode: exitCodes.unexpectedResponse,
      stdout: "",
    })
    expect(result.stderr).toContain("SUHUI_UNEXPECTED_RESPONSE")
    expect(result.stderr).toContain("unexpected response")
  })
})
