import { describe, expect, it } from "vitest"

import { findDuplicateFeed, normalizeFeedUrlForDedup } from "./rss-dedup"

describe("rss dedup", () => {
  it("同一 feed url 视为重复（忽略尾斜杠）", () => {
    const duplicate = findDuplicateFeed(
      [{ id: "f1", url: "https://example.com/rss/", siteUrl: "https://example.com" }],
      "https://example.com/rss",
      null,
    )
    expect(duplicate?.id).toBe("f1")
  })

  it("同一站点 host 的不同 feed url 视为重复", () => {
    const duplicate = findDuplicateFeed(
      [{ id: "f1", url: "https://example.com/feed.xml", siteUrl: "https://example.com" }],
      "https://example.com/rss",
      "https://example.com/posts",
    )
    expect(duplicate?.id).toBe("f1")
  })

  it("不同站点 host 不应视为重复", () => {
    const duplicate = findDuplicateFeed(
      [{ id: "f1", url: "https://example.com/feed.xml", siteUrl: "https://example.com" }],
      "https://other.example/rss",
      "https://other.example/posts",
    )
    expect(duplicate).toBeUndefined()
  })
})

describe("sitescrape 源的去重键", () => {
  it("生成结构正常的键，且不与站点真实订阅源冲突", () => {
    expect(normalizeFeedUrlForDedup("sitescrape:https://example.com/news?page=2")).toBe(
      "sitescrape:https://example.com/news",
    )
    expect(normalizeFeedUrlForDedup("sitescrape:https://example.com/news")).not.toBe(
      normalizeFeedUrlForDedup("https://example.com/news"),
    )
  })

  it("同一抓取目标的不同写法归一为同一个键", () => {
    expect(normalizeFeedUrlForDedup("sitescrape:https://example.com/news/")).toBe(
      normalizeFeedUrlForDedup("sitescrape:https://example.com/news"),
    )
  })
})
