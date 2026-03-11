import { describe, expect, it, vi } from "vitest"

import { refreshLocalFeedAndSyncEntries } from "./entry-refresh"

describe("refreshLocalFeedAndSyncEntries", () => {
  it("calls ipc refresh then fetchEntries", async () => {
    const invoke = vi.fn().mockResolvedValue()
    const fetchEntries = vi.fn().mockResolvedValue({ data: [] })

    await refreshLocalFeedAndSyncEntries({
      feedId: "local_feed_1",
      ipc: { invoke },
      fetchEntries,
    })

    expect(invoke).toHaveBeenCalledWith("db.refreshFeed", "local_feed_1")
    expect(fetchEntries).toHaveBeenCalledWith({ feedId: "local_feed_1" })
    const invokeOrder = invoke.mock.invocationCallOrder[0]!
    const fetchOrder = fetchEntries.mock.invocationCallOrder[0]!
    expect(invokeOrder).toBeLessThan(fetchOrder)
  })
})
