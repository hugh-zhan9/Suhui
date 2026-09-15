import { FeedViewType } from "@suhui/constants"
import { describe, expect, it } from "vitest"
import { vi } from "vitest"

import { countUnreadByView } from "./unread-by-view"

vi.mock("@suhui/store/subscription/getter", () => ({
  getSubscribedFeedIdAndInboxHandlesByView: ({ view }: { view: FeedViewType }) =>
    view === FeedViewType.Articles ? ["feed-a"] : ["feed-a", "feed-b"],
}))

describe("countUnreadByView", () => {
  const state = { data: { "feed-a": 120, "feed-b": 30, "feed-stale": 999 } }
  it("counts the database summary before any article has been loaded", () => {
    expect(countUnreadByView(state, FeedViewType.Articles)).toBe(120)
  })
  it("includes only currently subscribed sources in All", () => {
    expect(countUnreadByView(state, FeedViewType.All)).toBe(150)
  })
})
