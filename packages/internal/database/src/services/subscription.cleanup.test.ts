import { describe, expect, it } from "vitest"

import { collectCleanupTargets, deduplicateFeedSubscriptionsByUrl } from "./subscription"

describe("collectCleanupTargets", () => {
  it("应按订阅类型聚合并去重 feed/list/inbox 清理目标", () => {
    const result = collectCleanupTargets([
      { type: "feed", feedId: "feed-1", listId: null, inboxId: null },
      { type: "feed", feedId: "feed-1", listId: null, inboxId: null },
      { type: "list", feedId: null, listId: "list-1", inboxId: null },
      { type: "inbox", feedId: null, listId: null, inboxId: "inbox-1" },
    ])

    expect(result.feedIds).toEqual(["feed-1"])
    expect(result.listIds).toEqual(["list-1"])
    expect(result.inboxIds).toEqual(["inbox-1"])
  })

  it("应按归一化 feed url 去重重复 feed 订阅", () => {
    const result = deduplicateFeedSubscriptionsByUrl(
      [
        { id: "feed/feed-1", type: "feed", feedId: "feed-1" },
        { id: "feed/feed-2", type: "feed", feedId: "feed-2" },
        { id: "list/list-1", type: "list", listId: "list-1" },
      ] as any[],
      [
        { id: "feed-1", url: "https://blog.yasking.org/rss.xml" },
        { id: "feed-2", url: "https://blog.yasking.org/rss.xml/" },
      ] as any[],
    )

    expect(result.map((subscription) => subscription.id)).toEqual(["feed/feed-1", "list/list-1"])
  })
})
