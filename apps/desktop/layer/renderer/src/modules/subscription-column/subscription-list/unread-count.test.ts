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

  it.each([400, 800])("counts unread entries across %i deterministic subscriptions", (count) => {
    const feedIds = Array.from({ length: count }, (_, index) => `feed-${index}`)
    subscribedIdsByView.set(FeedViewType.All, feedIds)
    const data: Record<string, { id: string; read: boolean; feedId: string }> = {}
    const entryIdByFeed: Record<string, Set<string>> = {}

    for (const [index, feedId] of feedIds.entries()) {
      const unreadId = `${feedId}-unread`
      const readId = `${feedId}-read`
      data[unreadId] = { id: unreadId, read: false, feedId }
      data[readId] = { id: readId, read: true, feedId }
      entryIdByFeed[feedId] = new Set([unreadId, readId])
      if (index % 10 === 0) {
        const secondUnreadId = `${feedId}-unread-extra`
        data[secondUnreadId] = { id: secondUnreadId, read: false, feedId }
        entryIdByFeed[feedId]!.add(secondUnreadId)
      }
    }

    expect(
      selectTimelineUnreadByView(
        { data, entryIdByFeed, entryIdByInbox: {} } as any,
        FeedViewType.All,
      ),
    ).toBe(count + count / 10)
  })
})
