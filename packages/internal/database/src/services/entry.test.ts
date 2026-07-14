import { describe, expect, it, vi } from "vitest"

vi.mock("../db", () => ({
  db: {
    delete: vi.fn(),
  },
}))

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
