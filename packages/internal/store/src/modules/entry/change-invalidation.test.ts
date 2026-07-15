import type { QueryClient } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createEntryChangeInvalidationCoordinator,
  type EntryChangeInvalidationCoordinatorDependencies,
} from "./change-invalidation"
import { getEntryListQueryDescriptor } from "./hooks"

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

type FakeQuery = {
  queryKey: readonly unknown[]
  state: { data?: unknown }
  active: boolean
  staleCount: number
  refetchCount: number
  isActive(): boolean
}

const createQuery = ({
  queryKey,
  data,
  active = false,
}: {
  queryKey: readonly unknown[]
  data?: unknown
  active?: boolean
}): FakeQuery => ({
  queryKey,
  state: { data },
  active,
  staleCount: 0,
  refetchCount: 0,
  isActive() {
    return this.active
  },
})

const entryQueryKey = (scope: unknown, read?: boolean) => [
  "entries",
  {
    scope,
    ...(read === undefined ? {} : { read }),
    limit: 20,
  },
  false,
]

const entryPages = (...entries: Array<{ id: string; feedId?: string | null }>) => ({
  pages: [
    {
      data: entries,
      page: { limit: 20, hasMore: false, nextCursor: null },
    },
  ],
  pageParams: [undefined],
})

const entryItemPages = (...entries: Array<{ id: string; feedId?: string | null }>) => ({
  pages: [
    {
      items: entries,
      page: { limit: 20, hasMore: false, nextCursor: null },
    },
  ],
  pageParams: [undefined],
})

const change = (
  patch: Partial<{
    batchId: string
    reason: "refresh" | "read" | "collection" | "subscription" | "import"
    source: string
    scope: "feeds" | "all"
    feedIds: string[]
    entryIds: string[]
    refreshed: number
    failed: number
    completedAt: number
  }> = {},
) => ({
  version: 1 as const,
  batchId: "batch-1",
  reason: "refresh" as const,
  source: "test",
  scope: "feeds" as const,
  feedIds: ["feed-a"],
  entryIds: ["entry-a"],
  refreshed: 1,
  failed: 0,
  completedAt: 1_000,
  ...patch,
})

const createHarness = (
  queries: FakeQuery[] = [],
  overrides: Partial<EntryChangeInvalidationCoordinatorDependencies> = {},
) => {
  let now = 10_000
  const invalidateQueries = vi.fn(
    async ({
      predicate,
      refetchType,
    }: {
      predicate?: (query: FakeQuery) => boolean
      refetchType?: string
    }) => {
      for (const query of queries) {
        if (!predicate?.(query)) continue
        query.staleCount++
        if (refetchType === "active" && query.isActive()) query.refetchCount++
      }
    },
  )
  const queryClient = {
    getQueryCache: () => ({
      findAll: ({ predicate }: { predicate?: (query: FakeQuery) => boolean }) =>
        queries.filter((query) => predicate?.(query) ?? true),
    }),
    invalidateQueries,
  } as unknown as QueryClient
  const refreshUnread = vi.fn().mockResolvedValue(undefined)
  const refreshCollections = vi.fn().mockResolvedValue(undefined)
  const refreshSubscriptions = vi.fn().mockResolvedValue(undefined)
  const refreshBootstrap = vi.fn().mockResolvedValue(undefined)
  const settleReadEntries = vi.fn().mockResolvedValue(undefined)
  const recordRefreshRendererRefetchCount = vi.fn()

  const dependencies: EntryChangeInvalidationCoordinatorDependencies = {
    getQueryClient: () => queryClient,
    refreshUnread,
    refreshCollections,
    refreshSubscriptions,
    refreshBootstrap,
    settleReadEntries,
    now: () => now,
    recordRefreshRendererRefetchCount,
    ...overrides,
  }

  return {
    coordinator: createEntryChangeInvalidationCoordinator(dependencies),
    invalidateQueries,
    refreshUnread,
    refreshCollections,
    refreshSubscriptions,
    refreshBootstrap,
    settleReadEntries,
    recordRefreshRendererRefetchCount,
    advanceTime: (milliseconds: number) => {
      now += milliseconds
    },
  }
}

describe("getEntryListQueryDescriptor", () => {
  it("extracts a normalized descriptor without pagination fields", () => {
    expect(
      getEntryListQueryDescriptor([
        "entries",
        {
          scope: { kind: "feeds", feedIds: [" feed-b ", "feed-a", "feed-b"] },
          read: false,
          limit: 100,
          cursor: "opaque",
        },
        true,
      ]),
    ).toEqual({
      scope: { kind: "feeds", feedIds: ["feed-a", "feed-b"] },
      read: false,
    })
  })

  it("rejects malformed and non-entry query keys", () => {
    expect(getEntryListQueryDescriptor(["entry", { scope: { kind: "timeline" } }])).toBeNull()
    expect(
      getEntryListQueryDescriptor(["entries", { scope: { kind: "feeds", feedIds: [] } }]),
    ).toBeNull()
    expect(
      getEntryListQueryDescriptor([
        "entries",
        { scope: { kind: "timeline", excludePrivate: "yes" } },
      ]),
    ).toBeNull()
  })
})

describe("entry change invalidation coordinator", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ["refresh", 1, 1, 0, 0, 0],
    ["read", 1, 1, 0, 0, 1],
    ["collection", 1, 0, 1, 0, 0],
    ["subscription", 1, 1, 1, 1, 0],
    ["import", 1, 1, 1, 1, 0],
  ] as const)(
    "applies the %s matrix",
    async (reason, entries, unread, collections, subscriptions, settledReads) => {
      const harness = createHarness()

      await expect(
        harness.coordinator.handle(change({ reason, batchId: `batch-${reason}` }), "sse"),
      ).resolves.toBe("handled")

      expect(harness.invalidateQueries).toHaveBeenCalledTimes(entries)
      expect(harness.refreshUnread).toHaveBeenCalledTimes(unread)
      expect(harness.refreshCollections).toHaveBeenCalledTimes(collections)
      expect(harness.refreshSubscriptions).toHaveBeenCalledTimes(subscriptions)
      expect(harness.settleReadEntries).toHaveBeenCalledTimes(settledReads)
    },
  )

  it("dedupes response then event by batchId", async () => {
    const harness = createHarness()
    const payload = change({ batchId: "batch-response-event" })

    await expect(harness.coordinator.handle(payload, "response")).resolves.toBe("handled")
    await expect(harness.coordinator.handle(payload, "ipc")).resolves.toBe("duplicate")
    await expect(harness.coordinator.handle(payload, "sse")).resolves.toBe("duplicate")

    expect(harness.invalidateQueries).toHaveBeenCalledOnce()
    expect(harness.refreshUnread).toHaveBeenCalledOnce()
  })

  it("keeps duplicate callers pending on the same in-flight batch", async () => {
    const invalidation = createDeferred()
    const harness = createHarness()
    harness.invalidateQueries.mockImplementationOnce(() => invalidation.promise)
    const payload = change({ batchId: "batch-concurrent" })

    const event = harness.coordinator.handle(payload, "ipc")
    const response = harness.coordinator.handle(payload, "response")
    const responseSettled = vi.fn()
    void response.then(responseSettled, responseSettled)
    await Promise.resolve()

    expect(responseSettled).not.toHaveBeenCalled()
    expect(harness.invalidateQueries).toHaveBeenCalledOnce()

    invalidation.resolve()

    await expect(event).resolves.toBe("handled")
    await expect(response).resolves.toBe("duplicate")
    expect(harness.invalidateQueries).toHaveBeenCalledOnce()
    expect(harness.refreshUnread).toHaveBeenCalledOnce()
  })

  it("propagates an in-flight partial failure without replaying the owned batch", async () => {
    const unreadRefresh = createDeferred()
    const failure = new Error("unread refresh failed")
    const harness = createHarness()
    harness.refreshUnread.mockImplementationOnce(() => unreadRefresh.promise)
    const payload = change({ batchId: "batch-partial-failure" })

    const event = harness.coordinator.handle(payload, "ipc")
    const response = harness.coordinator.handle(payload, "response")
    const responseSettled = vi.fn()
    void response.then(responseSettled, responseSettled)
    await Promise.resolve()

    await flushPromises()
    expect(responseSettled).not.toHaveBeenCalled()
    expect(harness.invalidateQueries).toHaveBeenCalledOnce()
    expect(harness.refreshUnread).toHaveBeenCalledOnce()
    unreadRefresh.reject(failure)

    await expect(Promise.allSettled([event, response])).resolves.toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ])
    await expect(harness.coordinator.handle(payload, "response")).resolves.toBe("duplicate")
    await expect(harness.coordinator.handle(payload, "ipc")).resolves.toBe("duplicate")

    expect(harness.invalidateQueries).toHaveBeenCalledOnce()
    expect(harness.refreshUnread).toHaveBeenCalledOnce()
  })

  it("serializes metadata calibration so older state cannot overwrite a newer batch", async () => {
    const olderUnread = createDeferred()
    const olderCollections = createDeferred()
    const olderSubscriptions = createDeferred()
    const state = {
      unread: "initial",
      collections: "initial",
      subscriptions: "initial",
    }
    const refreshUnread = vi
      .fn()
      .mockImplementationOnce(async () => {
        await olderUnread.promise
        state.unread = "older"
      })
      .mockImplementationOnce(async () => {
        state.unread = "newer"
      })
    const refreshCollections = vi
      .fn()
      .mockImplementationOnce(async () => {
        await olderCollections.promise
        state.collections = "older"
      })
      .mockImplementationOnce(async () => {
        state.collections = "newer"
      })
    const refreshSubscriptions = vi
      .fn()
      .mockImplementationOnce(async () => {
        await olderSubscriptions.promise
        state.subscriptions = "older"
      })
      .mockImplementationOnce(async () => {
        state.subscriptions = "newer"
      })
    const harness = createHarness([], {
      refreshUnread,
      refreshCollections,
      refreshSubscriptions,
    })
    const older = harness.coordinator.handle(
      change({
        batchId: "batch-older-metadata",
        completedAt: 1_000,
        reason: "subscription",
        scope: "all",
        feedIds: [],
      }),
      "sse",
    )
    await flushPromises()
    const newer = harness.coordinator.handle(
      change({
        batchId: "batch-newer-metadata",
        completedAt: 2_000,
        reason: "subscription",
        scope: "all",
        feedIds: [],
      }),
      "sse",
    )
    await flushPromises()

    expect(refreshUnread).toHaveBeenCalledOnce()
    expect(refreshCollections).toHaveBeenCalledOnce()
    expect(refreshSubscriptions).toHaveBeenCalledOnce()

    olderUnread.resolve()
    olderCollections.resolve()
    olderSubscriptions.resolve()

    await expect(older).resolves.toBe("handled")
    await expect(newer).resolves.toBe("handled")
    expect(state).toEqual({
      unread: "newer",
      collections: "newer",
      subscriptions: "newer",
    })
  })

  it("keeps dedupe bounded by TTL, capacity, and session reset", async () => {
    const harness = createHarness()
    const ttlPayload = change({ batchId: "batch-ttl" })

    await expect(harness.coordinator.handle(ttlPayload, "sse")).resolves.toBe("handled")
    harness.advanceTime(5 * 60 * 1_000 + 1)
    await expect(harness.coordinator.handle(ttlPayload, "sse")).resolves.toBe("handled")

    harness.coordinator.resetForTests()
    for (let index = 0; index <= 512; index++) {
      await harness.coordinator.handle(change({ batchId: `bounded-${index}` }), "sse")
    }

    await expect(harness.coordinator.handle(change({ batchId: "bounded-0" }), "sse")).resolves.toBe(
      "handled",
    )
    await expect(
      harness.coordinator.handle(change({ batchId: "bounded-512" }), "sse"),
    ).resolves.toBe("duplicate")

    harness.coordinator.resetForTests()
    await expect(
      harness.coordinator.handle(change({ batchId: "bounded-512" }), "sse"),
    ).resolves.toBe("handled")
  })

  it("invalidates only refresh scopes intersecting successful feeds", async () => {
    const activeTimeline = createQuery({
      queryKey: entryQueryKey({ kind: "timeline" }),
      data: entryPages({ id: "entry-z", feedId: "feed-z" }),
      active: true,
    })
    const inactiveFeeds = createQuery({
      queryKey: entryQueryKey({ kind: "feeds", feedIds: ["feed-a", "feed-b"] }),
      data: entryPages({ id: "entry-a", feedId: "feed-a" }),
    })
    const activeListWithFeed = createQuery({
      queryKey: entryQueryKey({ kind: "list", listId: "list-a" }),
      data: entryItemPages({ id: "entry-a", feedId: "feed-a" }),
      active: true,
    })
    const inboxWithoutFeed = createQuery({
      queryKey: entryQueryKey({ kind: "inbox", inboxId: "inbox-a" }),
      data: entryPages({ id: "entry-b", feedId: "feed-b" }),
      active: true,
    })
    const collectionWithFeed = createQuery({
      queryKey: entryQueryKey({ kind: "collection" }),
      data: entryPages({ id: "entry-c", feedId: "feed-a" }),
    })
    const unrelatedFeeds = createQuery({
      queryKey: entryQueryKey({ kind: "feeds", feedIds: ["feed-z"] }),
      data: entryPages({ id: "entry-z", feedId: "feed-z" }),
      active: true,
    })
    const nonEntry = createQuery({
      queryKey: ["subscription"],
      active: true,
    })
    const harness = createHarness([
      activeTimeline,
      inactiveFeeds,
      activeListWithFeed,
      inboxWithoutFeed,
      collectionWithFeed,
      unrelatedFeeds,
      nonEntry,
    ])

    await harness.coordinator.handle(
      change({ batchId: "batch-intersection", feedIds: ["feed-a"] }),
      "sse",
    )

    expect(harness.invalidateQueries).toHaveBeenCalledOnce()
    expect(activeTimeline).toMatchObject({ staleCount: 1, refetchCount: 1 })
    expect(inactiveFeeds).toMatchObject({ staleCount: 1, refetchCount: 0 })
    expect(activeListWithFeed).toMatchObject({ staleCount: 1, refetchCount: 1 })
    expect(collectionWithFeed).toMatchObject({ staleCount: 1, refetchCount: 0 })
    expect(inboxWithoutFeed).toMatchObject({ staleCount: 0, refetchCount: 0 })
    expect(unrelatedFeeds).toMatchObject({ staleCount: 0, refetchCount: 0 })
    expect(nonEntry).toMatchObject({ staleCount: 0, refetchCount: 0 })
    expect(harness.recordRefreshRendererRefetchCount).toHaveBeenCalledWith({
      metric: "refresh_renderer_refetch_count",
      batchId: "batch-intersection",
      value: 2,
    })
  })

  it("settles read IDs before invalidating only cached pages that contain them", async () => {
    const order: string[] = []
    const withEntry = createQuery({
      queryKey: entryQueryKey({ kind: "timeline" }, false),
      data: entryPages({ id: "entry-a", feedId: "feed-a" }),
      active: true,
    })
    const inactiveWithEntry = createQuery({
      queryKey: entryQueryKey({ kind: "list", listId: "list-a" }, false),
      data: entryPages({ id: "entry-a", feedId: "feed-a" }),
    })
    const withoutEntry = createQuery({
      queryKey: entryQueryKey({ kind: "feeds", feedIds: ["feed-a"] }),
      data: entryPages({ id: "entry-b", feedId: "feed-a" }),
      active: true,
    })
    const settleReadEntries = vi.fn(async () => {
      order.push("settle")
    })
    const harness = createHarness([withEntry, inactiveWithEntry, withoutEntry], {
      settleReadEntries,
    })
    harness.invalidateQueries.mockImplementationOnce(async (options) => {
      order.push("invalidate")
      const predicate = options.predicate as unknown as (query: FakeQuery) => boolean
      for (const query of [withEntry, inactiveWithEntry, withoutEntry]) {
        if (!predicate(query)) continue
        query.staleCount++
        if (query.isActive()) query.refetchCount++
      }
    })

    await harness.coordinator.handle(
      change({
        batchId: "batch-read",
        reason: "read",
        entryIds: [" entry-a ", "entry-a"],
      }),
      "response",
    )

    expect(settleReadEntries).toHaveBeenCalledWith(["entry-a"])
    expect(order).toEqual(["settle", "invalidate"])
    expect(withEntry).toMatchObject({ staleCount: 1, refetchCount: 1 })
    expect(inactiveWithEntry).toMatchObject({ staleCount: 1, refetchCount: 0 })
    expect(withoutEntry).toMatchObject({ staleCount: 0, refetchCount: 0 })
  })

  it.each(["subscription", "import"] as const)(
    "stales every bounded entry scope for %s and refetches only active queries",
    async (reason) => {
      const activeTimeline = createQuery({
        queryKey: entryQueryKey({ kind: "timeline" }),
        active: true,
      })
      const inactiveFeeds = createQuery({
        queryKey: entryQueryKey({ kind: "feeds", feedIds: ["feed-a"] }),
      })
      const activeCollection = createQuery({
        queryKey: entryQueryKey({ kind: "collection" }),
        active: true,
      })
      const nonEntry = createQuery({ queryKey: ["subscriptions"], active: true })
      const harness = createHarness([activeTimeline, inactiveFeeds, activeCollection, nonEntry])

      await harness.coordinator.handle(
        change({ batchId: `batch-all-${reason}`, reason, scope: "all" }),
        "sse",
      )

      expect(harness.invalidateQueries).toHaveBeenCalledOnce()
      expect(activeTimeline).toMatchObject({ staleCount: 1, refetchCount: 1 })
      expect(inactiveFeeds).toMatchObject({ staleCount: 1, refetchCount: 0 })
      expect(activeCollection).toMatchObject({ staleCount: 1, refetchCount: 1 })
      expect(nonEntry).toMatchObject({ staleCount: 0, refetchCount: 0 })
    },
  )

  it("stales collection scopes only for collection changes", async () => {
    const collection = createQuery({
      queryKey: entryQueryKey({ kind: "collection", view: 1 }),
      active: true,
    })
    const timeline = createQuery({
      queryKey: entryQueryKey({ kind: "timeline", view: 1 }),
      active: true,
    })
    const harness = createHarness([collection, timeline])

    await harness.coordinator.handle(
      change({ batchId: "batch-collection", reason: "collection" }),
      "sse",
    )

    expect(collection).toMatchObject({ staleCount: 1, refetchCount: 1 })
    expect(timeline).toMatchObject({ staleCount: 0, refetchCount: 0 })
  })

  it("does not invalidate entry queries for an empty refresh success set", async () => {
    const harness = createHarness()

    await harness.coordinator.handle(
      change({ batchId: "batch-empty", feedIds: [], refreshed: 0 }),
      "response",
    )

    expect(harness.invalidateQueries).not.toHaveBeenCalled()
    expect(harness.refreshUnread).toHaveBeenCalledOnce()
    expect(harness.recordRefreshRendererRefetchCount).toHaveBeenCalledWith({
      metric: "refresh_renderer_refetch_count",
      batchId: "batch-empty",
      value: 0,
    })
  })

  it("treats out-of-order events as invalidation signals without merging payload data", async () => {
    const cachedData = entryPages({ id: "entry-a", feedId: "feed-a" })
    const query = createQuery({
      queryKey: entryQueryKey({ kind: "timeline" }),
      data: cachedData,
    })
    const harness = createHarness([query])

    await harness.coordinator.handle(change({ batchId: "batch-newer", completedAt: 2_000 }), "sse")
    await harness.coordinator.handle(change({ batchId: "batch-older", completedAt: 1_000 }), "sse")

    expect(query.state.data).toBe(cachedData)
    expect(query.staleCount).toBe(2)
    expect(harness.invalidateQueries).toHaveBeenCalledTimes(2)
  })

  it("performs one global entry invalidation and one bootstrap refresh on reconnect", async () => {
    const activeEntry = createQuery({
      queryKey: entryQueryKey({ kind: "timeline" }),
      active: true,
    })
    const inactiveEntry = createQuery({
      queryKey: entryQueryKey({ kind: "feeds", feedIds: ["feed-a"] }),
    })
    const nonEntry = createQuery({ queryKey: ["unread"] })
    const harness = createHarness([activeEntry, inactiveEntry, nonEntry])
    const historical = change({ batchId: "batch-before-disconnect" })

    await harness.coordinator.handle(historical, "sse")
    harness.invalidateQueries.mockClear()
    harness.refreshBootstrap.mockClear()
    activeEntry.staleCount = 0
    activeEntry.refetchCount = 0
    inactiveEntry.staleCount = 0

    await harness.coordinator.handleReconnect()

    expect(harness.invalidateQueries).toHaveBeenCalledOnce()
    expect(harness.refreshBootstrap).toHaveBeenCalledOnce()
    expect(activeEntry).toMatchObject({ staleCount: 1, refetchCount: 1 })
    expect(inactiveEntry).toMatchObject({ staleCount: 1, refetchCount: 0 })
    expect(nonEntry).toMatchObject({ staleCount: 0, refetchCount: 0 })
    await expect(harness.coordinator.handle(historical, "sse")).resolves.toBe("duplicate")
  })

  it("records only the batch correlation and numeric refetch count", async () => {
    const activeEntry = createQuery({
      queryKey: entryQueryKey({ kind: "timeline" }),
      active: true,
    })
    const harness = createHarness([activeEntry])

    await harness.coordinator.handle(
      change({
        batchId: "batch-private",
        source: "https://private.example/path?token=secret",
        feedIds: ["private feed title", "https://private.example/feed.xml"],
        refreshed: 2,
      }),
      "sse",
    )

    expect(harness.recordRefreshRendererRefetchCount).toHaveBeenCalledWith({
      metric: "refresh_renderer_refetch_count",
      batchId: "batch-private",
      value: 1,
    })
    expect(JSON.stringify(harness.recordRefreshRendererRefetchCount.mock.calls)).not.toContain(
      "private.example",
    )
    expect(JSON.stringify(harness.recordRefreshRendererRefetchCount.mock.calls)).not.toContain(
      "private feed title",
    )
  })

  it("ignores invalid payloads without side effects", async () => {
    const harness = createHarness()

    await expect(
      harness.coordinator.handle({ version: 1, batchId: "missing-fields" }, "sse"),
    ).resolves.toBe("ignored-invalid")

    expect(harness.invalidateQueries).not.toHaveBeenCalled()
    expect(harness.refreshUnread).not.toHaveBeenCalled()
    expect(harness.refreshCollections).not.toHaveBeenCalled()
    expect(harness.refreshSubscriptions).not.toHaveBeenCalled()
  })
})
