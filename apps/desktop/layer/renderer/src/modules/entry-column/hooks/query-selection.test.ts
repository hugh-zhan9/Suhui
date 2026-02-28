import { describe, expect, it } from "vitest"

import {
  normalizeFeedIdForActiveSubscription,
  normalizePendingFeedId,
  shouldUseLocalEntriesQuery,
} from "./query-selection"

describe("query selection", () => {
  it("收藏页应强制使用本地查询", () => {
    expect(shouldUseLocalEntriesQuery({ isCollection: true, remoteReady: true })).toBe(true)
  })

  it("非收藏页在远端就绪时优先使用远端查询", () => {
    expect(shouldUseLocalEntriesQuery({ isCollection: false, remoteReady: true })).toBe(false)
  })

  it("非收藏页在远端未就绪时使用本地查询", () => {
    expect(shouldUseLocalEntriesQuery({ isCollection: false, remoteReady: false })).toBe(true)
  })

  it("应将 pending feedId 归一化为空，避免误当真实订阅查询", () => {
    expect(normalizePendingFeedId("pending", "pending")).toBeUndefined()
    expect(normalizePendingFeedId("feed_1", "pending")).toBe("feed_1")
  })

  it("已取消订阅的 feedId 应归一化为空，避免 tab 切换后继续展示旧文章", () => {
    expect(
      normalizeFeedIdForActiveSubscription({
        feedId: "feed_1",
        pendingFeedId: "pending",
        isSubscribed: false,
        allowUnsubscribedFeed: false,
      }),
    ).toBeUndefined()
  })

  it("仍处于订阅状态的 feedId 应保留", () => {
    expect(
      normalizeFeedIdForActiveSubscription({
        feedId: "feed_1",
        pendingFeedId: "pending",
        isSubscribed: true,
        allowUnsubscribedFeed: false,
      }),
    ).toBe("feed_1")
  })

  it("未订阅但处于发现页预览态时应保留 feedId，用于展示预览文章列表", () => {
    expect(
      normalizeFeedIdForActiveSubscription({
        feedId: "feed_1",
        pendingFeedId: "pending",
        isSubscribed: false,
        allowUnsubscribedFeed: true,
      }),
    ).toBe("feed_1")
  })
})
