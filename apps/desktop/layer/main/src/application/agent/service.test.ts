import { describe, expect, it } from "vitest"

import { decodeAgentEntriesCursor, encodeAgentEntriesCursor, isEntryAfterCursor } from "./cursor"
import { AgentApplicationError, selectAgentEntryContent, toIsoString } from "./types"

describe("agent cursor", () => {
  it("round-trips an opaque cursor", () => {
    const cursor = encodeAgentEntriesCursor({
      publishedAt: 1710000000000,
      insertedAt: 1710000001000,
      id: "entry-b",
    })

    expect(cursor).not.toContain("entry-b")
    expect(decodeAgentEntriesCursor(cursor)).toEqual({
      publishedAt: 1710000000000,
      insertedAt: 1710000001000,
      id: "entry-b",
    })
  })

  it("orders entries after a cursor using publishedAt, insertedAt, then id", () => {
    const cursor = { publishedAt: 1000, insertedAt: 900, id: "entry-b" }

    expect(isEntryAfterCursor({ publishedAt: 999, insertedAt: 999, id: "entry-z" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 899, id: "entry-z" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 900, id: "entry-a" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 900, id: "entry-c" }, cursor)).toBe(
      false,
    )
  })

  it.each([
    ["malformed input", "not-json"],
    [
      "missing fields",
      Buffer.from(JSON.stringify({ publishedAt: 1710000000000, id: "entry-b" }), "utf8").toString(
        "base64url",
      ),
    ],
    [
      "non-finite timestamps",
      Buffer.from(
        '{"publishedAt":1e999,"insertedAt":1710000001000,"id":"entry-b"}',
        "utf8",
      ).toString("base64url"),
    ],
    [
      "empty id",
      Buffer.from(
        JSON.stringify({ publishedAt: 1710000000000, insertedAt: 1710000001000, id: "" }),
        "utf8",
      ).toString("base64url"),
    ],
  ])("rejects invalid cursor with %s", (_name, cursor) => {
    expect(() => decodeAgentEntriesCursor(cursor)).toThrow(AgentApplicationError)

    try {
      decodeAgentEntriesCursor(cursor)
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApplicationError)
      expect((error as AgentApplicationError).code).toBe("SUHUI_INVALID_CURSOR")
    }
  })
})

describe("toIsoString", () => {
  it("returns null for out-of-range date values", () => {
    expect(toIsoString(1e100)).toBeNull()
  })
})

describe("selectAgentEntryContent", () => {
  it("prefers readabilityContent, then content, then description", () => {
    expect(
      selectAgentEntryContent({
        readabilityContent: "<article>Readable</article>",
        content: "<p>Raw</p>",
        description: "Summary",
      }),
    ).toEqual({ content: "<article>Readable</article>", contentSource: "readabilityContent" })

    expect(
      selectAgentEntryContent({
        readabilityContent: "",
        content: "<p>Raw</p>",
        description: "Summary",
      }),
    ).toEqual({ content: "<p>Raw</p>", contentSource: "content" })

    expect(
      selectAgentEntryContent({
        readabilityContent: null,
        content: " ",
        description: "Summary",
      }),
    ).toEqual({ content: "Summary", contentSource: "description" })
  })
})
