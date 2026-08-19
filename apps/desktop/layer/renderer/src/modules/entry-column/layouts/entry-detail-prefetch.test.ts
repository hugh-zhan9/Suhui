import { afterEach, describe, expect, it, vi } from "vitest"

import { createEntryDetailPrefetch } from "./entry-detail-prefetch"

describe("createEntryDetailPrefetch", () => {
  afterEach(() => vi.useRealTimers())

  it("prefetches after a short hover/focus intent delay", async () => {
    vi.useFakeTimers()
    const fetchDetail = vi.fn().mockResolvedValue(null)
    const prefetch = createEntryDetailPrefetch({
      entryId: "entry-1",
      isDetailLoaded: () => false,
      fetchDetail,
      delayMs: 120,
    })

    prefetch.schedule()
    await vi.advanceTimersByTimeAsync(119)
    expect(fetchDetail).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchDetail).toHaveBeenCalledWith("entry-1")
  })

  it("cancels abandoned intent and skips details already in the store", async () => {
    vi.useFakeTimers()
    const fetchDetail = vi.fn().mockResolvedValue(null)
    const prefetch = createEntryDetailPrefetch({
      entryId: "entry-1",
      isDetailLoaded: () => true,
      fetchDetail,
      delayMs: 120,
    })

    prefetch.schedule()
    prefetch.cancel()
    await vi.runAllTimersAsync()
    expect(fetchDetail).not.toHaveBeenCalled()

    prefetch.schedule()
    await vi.runAllTimersAsync()
    expect(fetchDetail).not.toHaveBeenCalled()
  })
})
