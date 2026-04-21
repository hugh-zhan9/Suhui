import { beforeEach, describe, expect, it, vi } from "vitest"

const { findManyEntries, findManySubscriptions } = vi.hoisted(() => ({
  findManyEntries: vi.fn(),
  findManySubscriptions: vi.fn(),
}))

vi.mock("../db", () => ({
  db: {
    query: {
      entriesTable: {
        findMany: findManyEntries,
      },
      subscriptionsTable: {
        findMany: findManySubscriptions,
      },
    },
    delete: vi.fn(),
  },
}))

import { sanitizeEntryJsonFields } from "./entry"
import { EntryService } from "./entry"

describe("sanitizeEntryJsonFields", () => {
  beforeEach(() => {
    findManyEntries.mockReset()
    findManySubscriptions.mockReset()
  })

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

  it("hydrates all database entries without trimming or deleting", async () => {
    const rows = [
      { id: "entry_2", feedId: "feed-1", inboxHandle: null, sources: null, publishedAt: 2 },
      { id: "entry_1", feedId: "feed-1", inboxHandle: null, sources: null, publishedAt: 1 },
    ] as any[]
    findManyEntries.mockResolvedValue(rows)
    findManySubscriptions.mockResolvedValue([
      {
        id: "feed/feed-1",
        type: "feed",
        feedId: "feed-1",
        listId: null,
        inboxId: null,
      },
    ])

    await expect(EntryService.getEntriesToHydrate()).resolves.toEqual(rows)
    expect(findManyEntries).toHaveBeenCalledTimes(1)
  })

  it("filters hydrate entries that no longer have an active root relation", async () => {
    const rows = [
      { id: "entry_1", feedId: "feed-1", inboxHandle: null, sources: null, publishedAt: 2 },
      { id: "entry_2", feedId: "feed-2", inboxHandle: null, sources: null, publishedAt: 1 },
    ] as any[]
    findManyEntries.mockResolvedValue(rows)
    findManySubscriptions.mockResolvedValue([
      {
        id: "feed/feed-1",
        type: "feed",
        feedId: "feed-1",
        listId: null,
        inboxId: null,
      },
    ])

    await expect(EntryService.getEntriesToHydrate()).resolves.toEqual([rows[0]])
  })
})
