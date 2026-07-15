// @vitest-environment happy-dom

import { createEntryChangeEventV1, type EntryChangeEventV1 } from "@suhui/shared/entry-change"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  handleChange: vi.fn(),
  handleReconnect: vi.fn(),
  invalidateQueries: vi.fn(),
}))

vi.mock("@suhui/database/services/entry", () => ({
  EntryService: { patchMany: vi.fn() },
}))

vi.mock("@suhui/database/services/subscription", () => ({
  SubscriptionService: {
    deleteByTargets: vi.fn(),
    patch: vi.fn(),
    patchMany: vi.fn(),
  },
}))

vi.mock("../context", () => ({
  queryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock("../modules/collection/store", () => ({
  collectionActions: { upsertManyInSession: vi.fn() },
}))

vi.mock("../modules/entry/change-invalidation", () => ({
  entryChangeInvalidationCoordinator: {
    handle: mocks.handleChange,
    handleReconnect: mocks.handleReconnect,
    resetForTests: vi.fn(),
  },
}))

vi.mock("../modules/feed/store", () => ({
  feedActions: { upsertManyInSession: vi.fn() },
}))

vi.mock("../modules/subscription/store", () => ({
  subscriptionActions: { replaceManyInSession: vi.fn() },
}))

vi.mock("../modules/unread/store", () => ({
  unreadActions: { upsertManyInSession: vi.fn() },
}))

vi.mock("./env", () => ({
  getRuntimeEnv: () => ({ isRemote: true }),
}))

vi.mock("./transforms", () => ({
  transformCollectionsFromApi: (value: unknown) => value,
  transformEntryFromApi: (value: unknown) => value,
  transformSubscriptionFromApi: (value: unknown) => value,
  transformUnreadsFromApi: (value: unknown) => value,
}))

const { runtimeClient } = await import("../runtime/client")
const { remoteSSEHandler } = await import("./sse-handler")

type EventListener = (event: MessageEvent<string>) => void

class FakeEventSource {
  readonly close = vi.fn()
  onerror: ((event: Event) => void) | null = null
  private readonly listeners = new Map<string, EventListener[]>()

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  emit(type: string, payload?: unknown) {
    const data = payload === undefined ? "" : JSON.stringify(payload)
    const event = { data } as MessageEvent<string>
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  emitRaw(type: string, data: string) {
    const event = { data } as MessageEvent<string>
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  emitError() {
    this.onerror?.(new Event("error"))
  }
}

const change = (overrides: Partial<Omit<EntryChangeEventV1, "version">> = {}) =>
  createEntryChangeEventV1({
    batchId: "batch-1",
    reason: "refresh",
    source: "remote-test",
    scope: "feeds",
    feedIds: ["feed-1"],
    refreshed: 1,
    failed: 0,
    completedAt: 1_000,
    ...overrides,
  })

const jsonResponse = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("RemoteSSEHandler", () => {
  let eventSource: FakeEventSource

  beforeEach(() => {
    remoteSSEHandler.disconnect()
    vi.clearAllMocks()
    eventSource = new FakeEventSource()
    mocks.connect.mockReturnValue(eventSource as unknown as EventSource)
    vi.spyOn(runtimeClient.events, "connect").mockImplementation(mocks.connect)
    mocks.handleChange.mockResolvedValue("handled")
    mocks.handleReconnect.mockResolvedValue(undefined)
  })

  afterEach(() => {
    remoteSSEHandler.disconnect()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("reports the current disconnected state and becomes connected only after ready", () => {
    const onConnectionChange = vi.fn()
    remoteSSEHandler.setHandlers({ onConnectionChange })

    expect(onConnectionChange).toHaveBeenLastCalledWith(false)

    remoteSSEHandler.connect()
    expect(onConnectionChange).toHaveBeenLastCalledWith(false)

    eventSource.emit("ready")
    expect(onConnectionChange).toHaveBeenLastCalledWith(true)
  })

  it.each([1, 10, 50])("routes one %i-feed refresh event through the coordinator", async (size) => {
    const payload = change({
      batchId: `batch-refresh-${size}`,
      feedIds: Array.from({ length: size }, (_, index) => `feed-${index}`),
      refreshed: size,
    })

    remoteSSEHandler.connect()
    eventSource.emit("entries.updated", payload)
    await flushPromises()

    expect(mocks.handleChange).toHaveBeenCalledOnce()
    expect(mocks.handleChange).toHaveBeenCalledWith(payload, "sse")
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
  })

  it.each(["refresh", "read", "collection", "import"] as const)(
    "preserves entries.updated reason=%s",
    async (reason) => {
      const payload = change({
        batchId: `batch-${reason}`,
        reason,
        scope: "all",
        feedIds: [],
        ...(reason === "read" ? { entryIds: ["entry-1"] } : {}),
        refreshed: undefined,
        failed: undefined,
      })

      remoteSSEHandler.connect()
      eventSource.emit("entries.updated", payload)
      await flushPromises()

      expect(mocks.handleChange).toHaveBeenCalledWith(payload, "sse")
    },
  )

  it("normalizes subscriptions.updated to reason=subscription", async () => {
    const payload = change({
      batchId: "batch-subscription",
      feedId: "feed-1",
    })
    const expected = createEntryChangeEventV1({
      batchId: payload.batchId,
      reason: "subscription",
      source: payload.source,
      scope: "all",
      feedIds: payload.feedIds,
      refreshed: payload.refreshed,
      failed: payload.failed,
      completedAt: payload.completedAt,
    })

    remoteSSEHandler.connect()
    eventSource.emit("subscriptions.updated", payload)
    await flushPromises()

    expect(mocks.handleChange).toHaveBeenCalledWith(expected, "sse")
  })

  it("ignores malformed and legacy events without broad invalidation", async () => {
    remoteSSEHandler.connect()
    eventSource.emitRaw("entries.updated", "not-json")
    eventSource.emit("entries.updated", { feedId: "legacy-feed" })
    eventSource.emit("subscriptions.updated", {})
    await flushPromises()

    expect(mocks.handleChange).not.toHaveBeenCalled()
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
  })

  it("does not log payload fields while normalizing a received event", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {})
    const privatePayload = {
      ...change({
        batchId: "batch-private",
        source: "https://private.example/feed?token=secret",
      }),
      title: "Private title",
      content: "Private body",
    }

    remoteSSEHandler.connect()
    eventSource.emit("entries.updated", privatePayload)
    await flushPromises()

    expect(mocks.handleChange).toHaveBeenCalledWith(
      change({
        batchId: "batch-private",
        source: "https://private.example/feed?token=secret",
      }),
      "sse",
    )
    const logs = consoleLog.mock.calls.flat().join(" ")
    expect(logs).not.toContain("secret")
    expect(logs).not.toContain("Private title")
    expect(logs).not.toContain("Private body")
  })

  it("forwards out-of-order batches as invalidation signals without merging payload data", async () => {
    const newer = change({ batchId: "batch-newer", completedAt: 2_000 })
    const older = change({ batchId: "batch-older", completedAt: 1_000 })

    remoteSSEHandler.connect()
    eventSource.emit("entries.updated", newer)
    eventSource.emit("entries.updated", older)
    await flushPromises()

    expect(mocks.handleChange.mock.calls).toEqual([
      [newer, "sse"],
      [older, "sse"],
    ])
  })

  it("compensates exactly once after a disconnected interval", async () => {
    const onConnectionChange = vi.fn()
    remoteSSEHandler.setHandlers({ onConnectionChange })
    remoteSSEHandler.connect()
    eventSource.emit("ready")
    eventSource.emitError()
    eventSource.emit("ready")
    eventSource.emit("ready")
    await flushPromises()

    expect(mocks.handleReconnect).toHaveBeenCalledOnce()
    expect(onConnectionChange.mock.calls.map(([connected]) => connected)).toEqual([
      false,
      true,
      false,
      true,
    ])
  })

  it("processes a mutation response before deduping the later SSE event", async () => {
    const payload = change({
      batchId: "batch-read-response-event",
      reason: "read",
      scope: "all",
      feedIds: [],
      entryIds: ["entry-1"],
      refreshed: undefined,
      failed: undefined,
    })
    const response = { ok: true, batchId: payload.batchId, changeSet: payload }
    const processed = new Set<string>()
    let applied = 0
    mocks.handleChange.mockImplementation(async (received: EntryChangeEventV1) => {
      if (processed.has(received.batchId)) return "duplicate"
      processed.add(received.batchId)
      applied++
      return "handled"
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(response)),
    )

    remoteSSEHandler.connect()
    await expect(
      runtimeClient.entries.updateReadStatus({ entryIds: ["entry-1"], read: true }),
    ).resolves.toEqual(response)
    eventSource.emit("entries.updated", payload)
    await flushPromises()

    expect(mocks.handleChange.mock.calls).toEqual([
      [payload, "response"],
      [payload, "sse"],
    ])
    expect(applied).toBe(1)
  })

  it("keeps a committed mutation successful when cache calibration fails", async () => {
    const payload = change({
      batchId: "batch-read-calibration-failure",
      reason: "read",
      scope: "all",
      feedIds: [],
      entryIds: ["entry-1"],
      refreshed: undefined,
      failed: undefined,
    })
    const response = { ok: true, batchId: payload.batchId, changeSet: payload }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.handleChange.mockRejectedValueOnce(new Error("private calibration detail"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(response)),
    )

    await expect(
      runtimeClient.entries.updateReadStatus({ entryIds: ["entry-1"], read: true }),
    ).resolves.toEqual(response)
    await flushPromises()

    expect(mocks.handleChange).toHaveBeenCalledWith(payload, "response")
    expect(consoleError).toHaveBeenCalledWith(
      "[RuntimeClient] Remote mutation cache calibration failed",
      { batchId: payload.batchId },
    )
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("private calibration detail")
  })

  it("settles a committed mutation without waiting for cache calibration", async () => {
    const payload = change({ batchId: "batch-pending-calibration" })
    const response = {
      data: { feed: { id: "feed-1" } },
      batchId: payload.batchId,
      changeSet: payload,
    }
    const calibration = createDeferred<"handled">()
    mocks.handleChange.mockReturnValueOnce(calibration.promise)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(response)),
    )

    await expect(runtimeClient.feeds.refresh("feed-1")).resolves.toEqual(response)
    expect(mocks.handleChange).toHaveBeenCalledWith(payload, "response")

    calibration.resolve("handled")
    await flushPromises()
  })

  it("preserves Remote HTTP mutation failures and skips cache calibration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    )

    await expect(
      runtimeClient.entries.updateReadStatus({ entryIds: ["entry-1"], read: true }),
    ).rejects.toThrow("HTTP 503")
    expect(mocks.handleChange).not.toHaveBeenCalled()
  })

  it("returns complete Remote mutation envelopes and routes every reason through the coordinator", async () => {
    const subscriptionChange = change({
      batchId: "batch-subscription-response",
      reason: "subscription",
      scope: "all",
      feedIds: [],
      refreshed: undefined,
      failed: undefined,
    })
    const collectionChange = change({
      batchId: "batch-collection-response",
      reason: "collection",
      scope: "all",
      feedIds: [],
      entryIds: ["entry-1"],
      refreshed: undefined,
      failed: undefined,
    })
    const refreshChange = change({ batchId: "batch-refresh-response" })
    const refreshAllChange = change({
      batchId: "batch-refresh-all-response",
      feedIds: Array.from({ length: 10 }, (_, index) => `feed-${index}`),
      refreshed: 10,
    })
    const importChange = change({
      batchId: "batch-import-response",
      reason: "import",
      scope: "all",
      feedIds: [],
      refreshed: undefined,
      failed: undefined,
    })
    const responses = [
      {
        data: { subscription: { id: "feed/feed-1" } },
        batchId: subscriptionChange.batchId,
        changeSet: subscriptionChange,
      },
      { ok: true, batchId: subscriptionChange.batchId, changeSet: subscriptionChange },
      { ok: true, batchId: subscriptionChange.batchId, changeSet: subscriptionChange },
      { ok: true, batchId: subscriptionChange.batchId, changeSet: subscriptionChange },
      { ok: true, batchId: collectionChange.batchId, changeSet: collectionChange },
      {
        data: { feed: { id: "feed-1" } },
        batchId: refreshChange.batchId,
        changeSet: refreshChange,
      },
      {
        data: { total: 10, successCount: 10, failCount: 0 },
        batchId: refreshAllChange.batchId,
        changeSet: refreshAllChange,
      },
      { data: { imported: 1 }, batchId: importChange.batchId, changeSet: importChange },
    ]
    const fetchMock = vi.fn()
    for (const response of responses) fetchMock.mockResolvedValueOnce(jsonResponse(response))
    vi.stubGlobal("fetch", fetchMock)

    const results = [
      await runtimeClient.subscriptions.create({
        url: "https://example.com/feed.xml",
        view: 1 as never,
        category: null,
        title: null,
        isPrivate: false,
        hideFromTimeline: false,
        feedId: null,
        listId: undefined,
      }),
      await runtimeClient.subscriptions.updateById("feed/feed-1", { title: "Renamed" }),
      await runtimeClient.subscriptions.deleteByTargets({ feedIds: ["feed-1"] }),
      await runtimeClient.subscriptions.batchUpdate({ feedIds: ["feed-1"], view: 1 }),
      await runtimeClient.collections.updateEntryStar({
        entryId: "entry-1",
        starred: true,
        view: 1,
      }),
      await runtimeClient.feeds.refresh("feed-1"),
      await runtimeClient.feeds.refresh(),
      await runtimeClient.importExport.importData({ subscriptions: [] }),
    ]

    expect(results).toEqual(responses)
    expect(mocks.handleChange.mock.calls).toEqual([
      [subscriptionChange, "response"],
      [subscriptionChange, "response"],
      [subscriptionChange, "response"],
      [subscriptionChange, "response"],
      [collectionChange, "response"],
      [refreshChange, "response"],
      [refreshAllChange, "response"],
      [importChange, "response"],
    ])
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["/api/subscriptions", "POST"],
      ["/api/subscriptions/feed%2Ffeed-1", "PATCH"],
      ["/api/subscriptions", "DELETE"],
      ["/api/subscriptions", "PATCH"],
      ["/api/entries/star", "POST"],
      ["/api/feeds/feed-1/refresh", "POST"],
      ["/api/feeds/refresh-all", "POST"],
      ["/api/import", "POST"],
    ])
  })
})
