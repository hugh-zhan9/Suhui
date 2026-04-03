import { describe, expect, it, vi } from "vitest"

import {
  syncLocalFeedRefreshCompleted,
  shouldHandleBackgroundLocalFeedRefresh,
} from "./local-feed-refresh-sync"

describe("shouldHandleBackgroundLocalFeedRefresh", () => {
  it("handles only startup and interval auto refresh events", () => {
    expect(shouldHandleBackgroundLocalFeedRefresh("startup-auto")).toBe(true)
    expect(shouldHandleBackgroundLocalFeedRefresh("interval-auto")).toBe(true)
    expect(shouldHandleBackgroundLocalFeedRefresh("manual-batch")).toBe(false)
    expect(shouldHandleBackgroundLocalFeedRefresh(undefined)).toBe(false)
  })
})

describe("syncLocalFeedRefreshCompleted", () => {
  it("syncs successful feed ids for background refresh events", async () => {
    const fetchEntries = vi.fn().mockResolvedValue({ data: [] })

    await syncLocalFeedRefreshCompleted({
      payload: {
        source: "startup-auto",
        results: [
          { feedId: "feed_1", ok: true },
          { feedId: "feed_2", ok: false },
          { feedId: "feed_3", ok: true },
        ],
      },
      fetchEntries,
    })

    expect(fetchEntries).toHaveBeenCalledTimes(2)
    expect(fetchEntries).toHaveBeenNthCalledWith(1, { feedId: "feed_1" })
    expect(fetchEntries).toHaveBeenNthCalledWith(2, { feedId: "feed_3" })
  })

  it("ignores manual batch events because the active renderer already syncs inline", async () => {
    const fetchEntries = vi.fn().mockResolvedValue({ data: [] })

    await syncLocalFeedRefreshCompleted({
      payload: {
        source: "manual-batch",
        results: [{ feedId: "feed_1", ok: true }],
      },
      fetchEntries,
    })

    expect(fetchEntries).not.toHaveBeenCalled()
  })
})
