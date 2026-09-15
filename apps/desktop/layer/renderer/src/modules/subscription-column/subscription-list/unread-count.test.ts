import { FeedViewType } from "@suhui/constants"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { selectTimelineUnreadByView } from "./unread-count"

const { subscribedIdsByView } = vi.hoisted(() => ({
  subscribedIdsByView: new Map<FeedViewType, string[]>(),
}))

vi.mock("@suhui/store/subscription/getter", () => ({
  getSubscribedFeedIdAndInboxHandlesByView: ({ view }: { view: FeedViewType }) =>
    subscribedIdsByView.get(view) ?? [],
}))

describe("selectTimelineUnreadByView", () => {
  beforeEach(() => {
    subscribedIdsByView.clear()
    subscribedIdsByView.set(FeedViewType.All, ["feed-a", "feed-b"])
    subscribedIdsByView.set(FeedViewType.Articles, ["feed-a"])
  })

  it("标题未读数应与 tab 图标未读数使用同一按 view 统计逻辑", () => {
    const state = { data: { "feed-a": 1, "feed-b": 1 } }

    expect(selectTimelineUnreadByView(state as any, FeedViewType.All)).toBe(2)
    expect(selectTimelineUnreadByView(state as any, FeedViewType.Articles)).toBe(1)
  })

  it.each([400, 800])("counts unread entries across %i deterministic subscriptions", (count) => {
    const feedIds = Array.from({ length: count }, (_, index) => `feed-${index}`)
    subscribedIdsByView.set(FeedViewType.All, feedIds)
    const data = Object.fromEntries(feedIds.map((id, index) => [id, index % 10 === 0 ? 2 : 1]))

    expect(selectTimelineUnreadByView({ data }, FeedViewType.All)).toBe(count + count / 10)
  })
})
