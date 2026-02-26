import { describe, expect, it } from "vitest"

import { normalizePendingFeedId, shouldUseLocalEntriesQuery } from "./query-selection"

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
})
