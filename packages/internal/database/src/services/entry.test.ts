import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../db", () => ({
  db: {
    delete: vi.fn(),
  },
}))

import { resetRuntimeDbType, setRuntimeDbType } from "../schemas/runtime"

import { sanitizeEntryJsonFields } from "./entry"
import { EntryService } from "./entry"

describe("sanitizeEntryJsonFields", () => {
  it("stringifies jsonb entry columns before postgres upsert", () => {
    const result = sanitizeEntryJsonFields({
      id: "entry_1",
      title: "hello",
      media: [{ type: "video", url: "https://www.youtube.com/watch?v=abc123" }] as any,
      attachments: [
        { url: "https://www.youtube.com/watch?v=abc123", mime_type: "text/html" },
      ] as any,
      categories: ["dev", "rss"] as any,
      extra: { key: "value" } as any,
      sources: ["feed"] as any,
      settings: { hideTitle: true } as any,
    })

    expect(result.media).toBe('[{"type":"video","url":"https://www.youtube.com/watch?v=abc123"}]')
    expect(result.attachments).toBe(
      '[{"url":"https://www.youtube.com/watch?v=abc123","mime_type":"text/html"}]',
    )
    expect(result.categories).toBe('["dev","rss"]')
    expect(result.extra).toBe('{"key":"value"}')
    expect(result.sources).toBe('["feed"]')
    expect(result.settings).toBe('{"hideTitle":true}')
    expect(result.title).toBe("hello")
  })

  it("drops invalid pre-stringified json payloads to null", () => {
    const result = sanitizeEntryJsonFields({
      id: "entry_2",
      media: '{"type"}' as any,
    })

    expect(result.media).toBeNull()
  })

  it("does not expose an unbounded startup hydration API", () => {
    const removedMethod = ["getEntries", "ToHydrate"].join("")
    expect(removedMethod in EntryService).toBe(false)
  })
})

describe("sanitizeEntryJsonFields 的方言差异", () => {
  afterEach(() => resetRuntimeDbType())

  it("sqlite 下保持对象形态，不预先 stringify（否则 drizzle 再 stringify 会双重编码）", () => {
    setRuntimeDbType("sqlite")

    const result = sanitizeEntryJsonFields({
      id: "entry_sqlite",
      categories: ["dev", "rss"] as any,
      extra: { key: "value" } as any,
    })

    expect(result.categories).toEqual(["dev", "rss"])
    expect(result.extra).toEqual({ key: "value" })
  })

  it("sqlite 下把已被上游 stringify 的值解回对象", () => {
    setRuntimeDbType("sqlite")

    const result = sanitizeEntryJsonFields({
      id: "entry_sqlite_2",
      categories: '["dev","rss"]' as any,
    })

    expect(result.categories).toEqual(["dev", "rss"])
  })

  it("sqlite 下非法 JSON 字符串仍归零", () => {
    setRuntimeDbType("sqlite")

    expect(
      sanitizeEntryJsonFields({ id: "e", categories: "not json" as any }).categories,
    ).toBeNull()
  })

  it("postgres 下仍然预先 stringify", () => {
    setRuntimeDbType("postgres")

    expect(sanitizeEntryJsonFields({ id: "e", categories: ["a"] as any }).categories).toBe('["a"]')
  })
})
