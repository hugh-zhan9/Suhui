import { describe, expect, it, vi } from "vitest"

import {
  extractSuccessfulLocalRefreshFeedIds,
  refreshAllLocalFeedsAndSyncEntries,
  refreshLocalFeedAndSyncEntries,
  shouldUseBatchLocalRefresh,
  shouldUseLocalFeedRefresh,
} from "./entry-refresh"

describe("refreshLocalFeedAndSyncEntries", () => {
  it("calls ipc refresh then fetchEntries", async () => {
    const invoke = vi.fn().mockResolvedValue(void 0)
    const fetchEntries = vi.fn().mockResolvedValue({ data: [] })

    await refreshLocalFeedAndSyncEntries({
      feedId: "local_feed_1",
      ipc: { invoke },
      fetchEntries,
    })

    expect(invoke).toHaveBeenCalledWith("db.refreshFeed", "local_feed_1", {
      source: "manual-single",
    })
    expect(fetchEntries).toHaveBeenCalledWith({ feedId: "local_feed_1" })
    const invokeOrder = invoke.mock.invocationCallOrder[0]!
    const fetchOrder = fetchEntries.mock.invocationCallOrder[0]!
    expect(invokeOrder).toBeLessThan(fetchOrder)
  })

  it("treats imported numeric feeds without owner as local refresh targets", () => {
    expect(
      shouldUseLocalFeedRefresh({
        feedId: "199666248185461760",
        feed: { type: "feed", ownerUserId: null, url: "https://example.com/rss.xml" },
      }),
    ).toBe(true)
  })

  it("allows owned feeds with url to use the local refresh path", () => {
    expect(
      shouldUseLocalFeedRefresh({
        feedId: "199666248185461760",
        feed: { type: "feed", ownerUserId: "user_1", url: "https://example.com/rss.xml" },
      }),
    ).toBe(true)
  })

  it("treats the all-feeds route as a batch refresh target", () => {
    expect(
      shouldUseBatchLocalRefresh({
        feedId: "all",
        isAllFeeds: true,
        feed: undefined,
      }),
    ).toBe(true)
  })

  it("passes manual batch source metadata", async () => {
    const invoke = vi.fn().mockResolvedValue({ refreshed: 1, failed: 0 })

    await expect(refreshAllLocalFeedsAndSyncEntries({ ipc: { invoke } })).resolves.toEqual({
      refreshed: 1,
      failed: 0,
    })

    expect(invoke).toHaveBeenCalledWith("db.refreshLocalSubscribedFeeds", {
      source: "manual-batch",
    })
  })

  it("syncs successful batch-refreshed feeds back into the renderer store", async () => {
    const invoke = vi.fn().mockResolvedValue({
      refreshed: 2,
      failed: 1,
      results: [
        { feedId: "feed_1", ok: true, entriesCount: 3 },
        { feedId: "feed_2", ok: false, error: "timeout" },
        { feedId: "feed_3", ok: true, entriesCount: 1 },
        { feedId: "feed_1", ok: true, entriesCount: 3 },
      ],
    })
    const fetchEntries = vi.fn().mockResolvedValue({ data: [] })

    await refreshAllLocalFeedsAndSyncEntries({
      ipc: { invoke },
      fetchEntries,
    })

    expect(fetchEntries).toHaveBeenCalledTimes(2)
    expect(fetchEntries).toHaveBeenNthCalledWith(1, { feedId: "feed_1" })
    expect(fetchEntries).toHaveBeenNthCalledWith(2, { feedId: "feed_3" })
  })
})

describe("extractSuccessfulLocalRefreshFeedIds", () => {
  it("returns only successful unique feed ids", () => {
    expect(
      extractSuccessfulLocalRefreshFeedIds({
        results: [
          { feedId: "feed_1", ok: true },
          { feedId: "feed_2", ok: false },
          { feedId: "feed_3", ok: true },
          { feedId: "feed_1", ok: true },
          { feedId: "", ok: true },
        ],
      }),
    ).toEqual(["feed_1", "feed_3"])
  })
})
