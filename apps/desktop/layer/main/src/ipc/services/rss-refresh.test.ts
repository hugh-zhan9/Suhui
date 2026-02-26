import { describe, expect, it } from "vitest"

import { buildRefreshedFeed } from "./rss-refresh"

describe("rss refresh helper", () => {
  it("刷新后保持原 feed id/url，并更新可覆盖字段", () => {
    const feed = buildRefreshedFeed(
      {
        id: "local_feed_1",
        url: "https://example.com/rss",
        title: "Old",
        description: null,
        image: null,
        siteUrl: "https://example.com",
        errorAt: null,
        ownerUserId: null,
        errorMessage: null,
        subscriptionCount: null,
        updatesPerWeek: null,
        latestEntryPublishedAt: null,
        tipUserIds: null,
        updatedAt: null,
      },
      {
        title: "New",
        description: "desc",
        image: "https://example.com/logo.png",
        siteUrl: "https://example.com/home",
      },
    )

    expect(feed.id).toBe("local_feed_1")
    expect(feed.url).toBe("https://example.com/rss")
    expect(feed.title).toBe("New")
    expect(feed.description).toBe("desc")
    expect(feed.image).toBe("https://example.com/logo.png")
    expect(feed.siteUrl).toBe("https://example.com/home")
  })
})

