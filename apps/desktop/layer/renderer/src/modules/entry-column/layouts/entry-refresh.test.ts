import { createEntryChangeEventV1, type EntryChangeEventV1 } from "@suhui/shared/entry-change"
import {
  createEntryChangeInvalidationCoordinator,
  type EntryChangeInvalidationCoordinatorDependencies,
} from "@suhui/store/entry/change-invalidation"
import type { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import { syncLocalFeedRefreshCompleted } from "~/lib/local-feed-refresh-sync"

import {
  refreshAllLocalFeedsAndSyncEntries,
  refreshLocalFeedAndSyncEntries,
  shouldUseBatchLocalRefresh,
  shouldUseLocalFeedRefresh,
} from "./entry-refresh"

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const createRefreshChangeSet = ({
  batchId = "batch-1",
  source = "manual-batch",
  feedIds = ["feed_1"],
  failed = 0,
}: {
  batchId?: string
  source?: string
  feedIds?: string[]
  failed?: number
} = {}) =>
  createEntryChangeEventV1({
    batchId,
    reason: "refresh",
    source,
    scope: "feeds",
    feedIds,
    refreshed: feedIds.length,
    failed,
    completedAt: 123,
    ...(source === "manual-single" && feedIds.length === 1 ? { feedId: feedIds[0] } : {}),
  })

const createCoordinatorHarness = () => {
  const activeEntryQuery = {
    queryKey: ["entries", { scope: { kind: "timeline" }, limit: 20 }, false],
    state: { data: { pages: [] } },
    isActive: () => true,
  }
  const invalidateQueries = vi.fn().mockResolvedValue(undefined)
  const queryClient = {
    getQueryCache: () => ({
      findAll: ({ predicate }: { predicate?: (query: typeof activeEntryQuery) => boolean }) =>
        predicate?.(activeEntryQuery) ? [activeEntryQuery] : [],
    }),
    invalidateQueries,
  } as unknown as QueryClient
  const refreshUnread = vi.fn().mockResolvedValue(undefined)
  const recordRefreshRendererRefetchCount = vi.fn()
  const noOp = vi.fn().mockResolvedValue(undefined)
  const dependencies: EntryChangeInvalidationCoordinatorDependencies = {
    getQueryClient: () => queryClient,
    refreshUnread,
    refreshCollections: noOp,
    refreshSubscriptions: noOp,
    refreshBootstrap: noOp,
    settleReadEntries: noOp,
    now: () => 1_000,
    recordRefreshRendererRefetchCount,
  }
  const coordinator = createEntryChangeInvalidationCoordinator(dependencies)
  const handleChange = vi.fn(coordinator.handle.bind(coordinator))

  return {
    handleChange,
    invalidateQueries,
    refreshUnread,
    recordRefreshRendererRefetchCount,
  }
}

const createBatchResponse = (changeSet: EntryChangeEventV1) => ({
  total: changeSet.feedIds.length + (changeSet.failed ?? 0),
  refreshed: changeSet.refreshed ?? 0,
  failed: changeSet.failed ?? 0,
  results: [
    ...changeSet.feedIds.map((feedId) => ({ feedId, ok: true, entriesCount: 1 })),
    ...Array.from({ length: changeSet.failed ?? 0 }, (_, index) => ({
      feedId: `failed_${index}`,
      ok: false,
      error: "timeout",
    })),
  ],
  batchId: changeSet.batchId,
  changeSet,
})

describe("refreshLocalFeedAndSyncEntries", () => {
  it("routes the raw single-feed response through the coordinator before returning it", async () => {
    const changeSet = createRefreshChangeSet({ source: "manual-single" })
    const response = {
      feed: { id: "feed_1" },
      entriesCount: 3,
      batchId: changeSet.batchId,
      changeSet,
    }
    const invoke = vi.fn().mockResolvedValue(response)
    const handleChange = vi.fn().mockResolvedValue("handled")

    await expect(
      refreshLocalFeedAndSyncEntries({
        feedId: "feed_1",
        ipc: { invoke },
        handleChange,
      }),
    ).resolves.toBe(response)

    expect(invoke).toHaveBeenCalledWith("db.refreshFeed", "feed_1", {
      source: "manual-single",
    })
    expect(handleChange).toHaveBeenCalledWith(changeSet, "response")
    expect(invoke.mock.invocationCallOrder[0]).toBeLessThan(
      handleChange.mock.invocationCallOrder[0]!,
    )
  })

  it("rejects an invalid response ChangeSet so the caller can use its fallback refetch", async () => {
    const handleChange = vi.fn().mockResolvedValue("ignored-invalid")

    await expect(
      refreshLocalFeedAndSyncEntries({
        feedId: "feed_1",
        ipc: { invoke: vi.fn().mockResolvedValue({ entriesCount: 1 }) },
        handleChange,
      }),
    ).rejects.toThrow("Invalid refresh ChangeSet")
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
})

describe("refreshAllLocalFeedsAndSyncEntries", () => {
  it("treats the all-feeds route as a batch refresh target", () => {
    expect(
      shouldUseBatchLocalRefresh({
        feedId: "all",
        isAllFeeds: true,
        feed: undefined,
      }),
    ).toBe(true)
  })

  it.each([1, 10, 50])(
    "handles one response and one later IPC event for %i successful feeds",
    async (size) => {
      const feedIds = Array.from({ length: size }, (_, index) => `feed_${index}`)
      const changeSet = createRefreshChangeSet({ batchId: `batch-${size}`, feedIds })
      const response = createBatchResponse(changeSet)
      const invoke = vi.fn().mockResolvedValue(response)
      const harness = createCoordinatorHarness()

      await expect(
        refreshAllLocalFeedsAndSyncEntries({
          ipc: { invoke },
          handleChange: harness.handleChange,
        }),
      ).resolves.toBe(response)
      await expect(
        syncLocalFeedRefreshCompleted({
          payload: changeSet,
          handleChange: harness.handleChange,
        }),
      ).resolves.toBe("duplicate")

      expect(invoke).toHaveBeenCalledWith("db.refreshLocalSubscribedFeeds", {
        source: "manual-batch",
      })
      expect(harness.handleChange).toHaveBeenNthCalledWith(1, changeSet, "response")
      expect(harness.handleChange).toHaveBeenNthCalledWith(2, changeSet, "ipc")
      expect(harness.invalidateQueries).toHaveBeenCalledOnce()
      expect(harness.refreshUnread).toHaveBeenCalledOnce()
      expect(harness.recordRefreshRendererRefetchCount).toHaveBeenCalledWith({
        metric: "refresh_renderer_refetch_count",
        batchId: `batch-${size}`,
        value: 1,
      })
    },
  )

  it("keeps an event-first manual response pending until shared invalidation completes", async () => {
    const changeSet = createRefreshChangeSet({ batchId: "batch-event-first" })
    const response = createBatchResponse(changeSet)
    const harness = createCoordinatorHarness()
    const invalidation = createDeferred()
    harness.invalidateQueries.mockImplementationOnce(() => invalidation.promise)

    const event = syncLocalFeedRefreshCompleted({
      payload: changeSet,
      handleChange: harness.handleChange,
    })
    const manualResponse = refreshAllLocalFeedsAndSyncEntries({
      ipc: { invoke: vi.fn().mockResolvedValue(response) },
      handleChange: harness.handleChange,
    })
    const manualSettled = vi.fn()
    void manualResponse.then(manualSettled, manualSettled)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(manualSettled).not.toHaveBeenCalled()
    expect(harness.invalidateQueries).toHaveBeenCalledOnce()

    invalidation.resolve()

    await expect(event).resolves.toBe("handled")
    await expect(manualResponse).resolves.toBe(response)

    expect(harness.handleChange).toHaveBeenNthCalledWith(1, changeSet, "ipc")
    expect(harness.handleChange).toHaveBeenNthCalledWith(2, changeSet, "response")
    expect(harness.invalidateQueries).toHaveBeenCalledOnce()
    expect(harness.refreshUnread).toHaveBeenCalledOnce()
  })

  it("propagates event-first invalidation failure so the manual caller runs its fallback", async () => {
    const changeSet = createRefreshChangeSet({ batchId: "batch-event-failure" })
    const response = createBatchResponse(changeSet)
    const harness = createCoordinatorHarness()
    const invalidation = createDeferred()
    const failure = new Error("invalidation failed")
    const fallbackRefetch = vi.fn().mockResolvedValue(undefined)
    harness.invalidateQueries.mockImplementationOnce(() => invalidation.promise)

    const event = syncLocalFeedRefreshCompleted({
      payload: changeSet,
      handleChange: harness.handleChange,
    })
    const manualResponse = refreshAllLocalFeedsAndSyncEntries({
      ipc: { invoke: vi.fn().mockResolvedValue(response) },
      handleChange: harness.handleChange,
    }).catch(async (error) => {
      await fallbackRefetch()
      throw error
    })
    const manualSettled = vi.fn()
    void manualResponse.then(manualSettled, manualSettled)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(manualSettled).not.toHaveBeenCalled()
    invalidation.reject(failure)

    await expect(Promise.allSettled([event, manualResponse])).resolves.toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ])
    expect(fallbackRefetch).toHaveBeenCalledOnce()
    expect(harness.invalidateQueries).toHaveBeenCalledOnce()
    expect(harness.refreshUnread).not.toHaveBeenCalled()
  })

  it("preserves partial failure details while invalidating only successful feed scopes", async () => {
    const changeSet = createRefreshChangeSet({
      batchId: "batch-partial",
      feedIds: ["feed_1", "feed_3"],
      failed: 1,
    })
    const response = createBatchResponse(changeSet)
    const handleChange = vi.fn().mockResolvedValue("handled")

    await expect(
      refreshAllLocalFeedsAndSyncEntries({
        ipc: { invoke: vi.fn().mockResolvedValue(response) },
        handleChange,
      }),
    ).resolves.toBe(response)

    expect(response.results).toContainEqual({
      feedId: "failed_0",
      ok: false,
      error: "timeout",
    })
    expect(handleChange).toHaveBeenCalledWith(changeSet, "response")
  })

  it("preserves zero-success failures without invalidating an entry query", async () => {
    const changeSet = createRefreshChangeSet({
      batchId: "batch-zero",
      feedIds: [],
      failed: 2,
    })
    const response = createBatchResponse(changeSet)
    const harness = createCoordinatorHarness()

    await expect(
      refreshAllLocalFeedsAndSyncEntries({
        ipc: { invoke: vi.fn().mockResolvedValue(response) },
        handleChange: harness.handleChange,
      }),
    ).resolves.toBe(response)

    expect(response).toMatchObject({ refreshed: 0, failed: 2 })
    expect(response.results.filter((item) => !item.ok)).toHaveLength(2)
    expect(harness.invalidateQueries).not.toHaveBeenCalled()
    expect(harness.recordRefreshRendererRefetchCount).toHaveBeenCalledWith({
      metric: "refresh_renderer_refetch_count",
      batchId: "batch-zero",
      value: 0,
    })
  })

  it("keeps renderer refetch metrics free of source and feed data", async () => {
    const changeSet = createRefreshChangeSet({
      batchId: "batch-private",
      source: "https://private.example/path?token=secret",
      feedIds: ["private feed title"],
    })
    const harness = createCoordinatorHarness()

    await refreshAllLocalFeedsAndSyncEntries({
      ipc: { invoke: vi.fn().mockResolvedValue(createBatchResponse(changeSet)) },
      handleChange: harness.handleChange,
    })

    expect(harness.recordRefreshRendererRefetchCount).toHaveBeenCalledWith({
      metric: "refresh_renderer_refetch_count",
      batchId: "batch-private",
      value: 1,
    })
    expect(JSON.stringify(harness.recordRefreshRendererRefetchCount.mock.calls)).not.toMatch(
      /private\.example|private feed title|token=secret/,
    )
  })
})
