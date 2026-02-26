import { FeedViewType } from "@follow/constants"
import { describe, expect, it } from "vitest"
import { vi } from "vitest"

import { selectTimelineUnreadByView } from "./unread-count"

vi.mock("@follow/store/subscription/getter", () => ({
  getSubscribedFeedIdAndInboxHandlesByView: ({ view }: { view: FeedViewType }) =>
    view === FeedViewType.Articles ? ["feed-a"] : ["feed-a", "feed-b"],
}))

describe("selectTimelineUnreadByView", () => {
  it("标题未读数应与 tab 图标未读数使用同一按 view 统计逻辑", () => {
    const state = {
      data: {
        e1: { id: "e1", read: false, feedId: "feed-a" },
        e2: { id: "e2", read: true, feedId: "feed-a" },
        e3: { id: "e3", read: false, feedId: "feed-b" },
      },
      entryIdByFeed: {
        "feed-a": new Set(["e1", "e2"]),
        "feed-b": new Set(["e3"]),
      },
      entryIdByInbox: {},
    }

    expect(selectTimelineUnreadByView(state as any, FeedViewType.All)).toBe(2)
    expect(selectTimelineUnreadByView(state as any, FeedViewType.Articles)).toBe(1)
  })
})
