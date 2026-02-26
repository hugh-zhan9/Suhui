import { FeedViewType } from "@follow/constants"
import { describe, expect, it } from "vitest"
import { vi } from "vitest"

import { countUnreadByView } from "./unread-by-view"

vi.mock("@follow/store/subscription/getter", () => ({
  getSubscribedFeedIdAndInboxHandlesByView: ({ view }: { view: FeedViewType }) =>
    view === FeedViewType.Articles ? ["feed-a"] : ["feed-a", "feed-b"],
}))

describe("countUnreadByView", () => {
  it("按当前订阅来源统计指定视图未读数", () => {
    const count = countUnreadByView(
      {
        data: {
          e1: { id: "e1", read: false, feedId: "feed-a" },
          e2: { id: "e2", read: true, feedId: "feed-a" },
          e3: { id: "e3", read: false, feedId: "feed-b" },
          e4: { id: "e4", read: false, feedId: "feed-stale" },
        },
        entryIdByFeed: {
          "feed-a": new Set(["e1", "e2"]),
          "feed-b": new Set(["e3"]),
          "feed-stale": new Set(["e4"]),
        },
        entryIdByInbox: {
          inbox_1: new Set<string>(),
        },
      } as any,
      FeedViewType.Articles,
    )

    expect(count).toBe(1)
  })

  it("All 只统计当前订阅来源，不统计陈旧来源", () => {
    const count = countUnreadByView(
      {
        data: {
          e1: { id: "e1", read: false, feedId: "feed-a" },
          e3: { id: "e3", read: false, feedId: "feed-b" },
          e4: { id: "e4", read: false, feedId: "feed-stale" },
        },
        entryIdByFeed: {
          "feed-a": new Set(["e1"]),
          "feed-b": new Set(["e3"]),
          "feed-stale": new Set(["e4"]),
        },
        entryIdByInbox: {},
      } as any,
      FeedViewType.All,
    )

    expect(count).toBe(2)
  })
})
