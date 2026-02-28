import { describe, expect, it } from "vitest"

import { findDuplicateFeed } from "./rss-dedup"

describe("rss dedup", () => {
  it("同一 feed url 视为重复（忽略尾斜杠）", () => {
    const duplicate = findDuplicateFeed(
      [{ id: "f1", url: "https://example.com/rss/", siteUrl: "https://example.com" }],
      "https://example.com/rss",
      null,
    )
    expect(duplicate?.id).toBe("f1")
  })

  it("不同 feed url 即使同 host 也不应视为重复", () => {
    const duplicate = findDuplicateFeed(
      [{ id: "f1", url: "https://example.com/feed.xml", siteUrl: "https://example.com" }],
      "https://example.com/rss",
      "https://example.com/posts",
    )
    expect(duplicate).toBeUndefined()
  })
})
