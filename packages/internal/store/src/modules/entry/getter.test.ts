import { describe, expect, it } from "vitest"

import { getEntryIdsByFeedIdsSelector } from "./getter"

describe("getEntryIdsByFeedIdsSelector", () => {
  it("应对重复的 feedIds 去重，避免重复条目 id", () => {
    const state = {
      data: {
        entry_1: { id: "entry_1", publishedAt: "2026-01-01T00:00:00.000Z" },
        entry_2: { id: "entry_2", publishedAt: "2026-01-02T00:00:00.000Z" },
      },
      entryIdByFeed: {
        feed_a: new Set(["entry_1", "entry_2"]),
      },
    } as any

    const ids = getEntryIdsByFeedIdsSelector(state)(["feed_a", "feed_a"])

    expect(ids).toHaveLength(2)
    expect(ids).toEqual(expect.arrayContaining(["entry_1", "entry_2"]))
  })
})
