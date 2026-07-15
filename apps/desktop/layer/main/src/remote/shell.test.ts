import { parseHTML } from "linkedom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { getRemoteShellHtml, getRemoteShellScript } from "./shell"

type ChangeSet = {
  version: 1
  batchId: string
  reason: "refresh" | "read" | "collection" | "subscription" | "import"
  source: string
  scope: "feeds" | "all"
  feedIds: string[]
  entryIds?: string[]
  refreshed?: number
  failed?: number
  completedAt: number
  feedId?: string
}

type ResponseBody = { changeSet: ChangeSet }
type MutationResponse = {
  ok: boolean
  status: number
  body: Promise<unknown>
}

type MockResponse = {
  ok?: boolean
  status?: number
  body: unknown | Promise<unknown>
}

type HarnessOptions = {
  bootstrapResponses?: MockResponse[]
  entryResponses?: MockResponse[]
  waitForInitialEntries?: boolean
}

const feedSubscription = (feedId: string, title: string) => ({
  id: `sub-${feedId}`,
  type: "feed" as const,
  feedId,
  listId: null,
  inboxId: null,
  title,
})

const bootstrapBody = (
  subscriptions = [feedSubscription("feed-active", "Active")],
  unread: Array<{ id: string; count: number }> = [{ id: "feed-active", count: 1 }],
) => ({
  data: {
    subscriptions,
    feeds: subscriptions
      .filter((subscription) => subscription.feedId)
      .map((subscription) => ({
        id: subscription.feedId,
        title: subscription.title,
        url: "",
      })),
    unread,
    collections: [],
    settings: {},
    capabilities: {},
  },
})

const changeSet = (
  batchId: string,
  feedIds: string[],
  options: Partial<ChangeSet> = {},
): ChangeSet => ({
  version: 1,
  batchId,
  reason: "refresh",
  source: "remote",
  scope: "feeds",
  feedIds,
  refreshed: feedIds.length,
  failed: 0,
  completedAt: 1,
  ...options,
})

const feedIds = (size: number) => [
  "feed-active",
  ...Array.from({ length: size - 1 }, (_, index) => `feed-${index + 1}`),
]

class EventSourceStub {
  static instance: EventSourceStub | null = null
  private readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>()
  onerror: (() => void) | null = null

  constructor(_url: string) {
    EventSourceStub.instance = this
  }

  addEventListener(name: string, listener: (event: { data?: string }) => void) {
    const listeners = this.listeners.get(name) ?? []
    listeners.push(listener)
    this.listeners.set(name, listeners)
  }

  emit(name: string, payload?: ChangeSet) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: payload ? JSON.stringify(payload) : undefined })
    }
  }

  disconnect() {
    this.onerror?.()
  }
}

const createHarness = async (options: HarnessOptions = {}) => {
  const { document } = parseHTML(getRemoteShellHtml())
  const requests = { entries: 0, bootstrap: 0, mutations: 0 }
  const requestUrls: string[] = []
  let mutationResponse: MutationResponse = {
    ok: true,
    status: 200,
    body: Promise.resolve({ changeSet: changeSet("default", ["feed-active"]) }),
  }
  const bootstrapResponses = [...(options.bootstrapResponses ?? [])]
  const entryResponses = [...(options.entryResponses ?? [])]

  const response = (spec: MockResponse) => ({
    ok: spec.ok ?? true,
    status: spec.status ?? 200,
    json: async () => await spec.body,
  })
  const fetch = vi.fn(async (input: string, init?: { method?: string }) => {
    requestUrls.push(input)
    if (init?.method === "POST") {
      requests.mutations += 1
      return {
        ok: mutationResponse.ok,
        status: mutationResponse.status,
        json: () => mutationResponse.body,
      }
    }
    if (input.startsWith("/api/entries?")) {
      requests.entries += 1
      return response(
        entryResponses.shift() ?? {
          body: {
            data: [
              { id: "entry-active", feedId: "feed-active", title: "Active entry", read: false },
            ],
            page: { limit: 20, hasMore: false, nextCursor: null },
          },
        },
      )
    }
    if (input === "/api/bootstrap") {
      requests.bootstrap += 1
      return response(
        bootstrapResponses.shift() ?? {
          body: bootstrapBody(),
        },
      )
    }
    throw new Error(`Unexpected request: ${input}`)
  })

  EventSourceStub.instance = null
  const execute = new Function(
    "document",
    "fetch",
    "EventSource",
    "URLSearchParams",
    "console",
    getRemoteShellScript(),
  )
  execute(document, fetch, EventSourceStub, URLSearchParams, console)
  if (options.waitForInitialEntries === false) {
    await vi.waitFor(() => expect(requests.bootstrap).toBe(1))
  } else {
    await vi.waitFor(() => expect(document.querySelector("[data-entry-id]")).not.toBeNull())
  }

  const resetRequests = () => {
    requests.entries = 0
    requests.bootstrap = 0
    requests.mutations = 0
    requestUrls.length = 0
  }
  const readButton = () =>
    document.querySelector('[data-entry-id="entry-active"]') as unknown as {
      click(): void
      hasAttribute(name: string): boolean
    }
  const initialRequestUrls = [...requestUrls]
  resetRequests()

  return {
    requests,
    requestUrls,
    initialRequestUrls,
    document,
    eventSource: EventSourceStub.instance!,
    setMutationBody(body: Promise<ResponseBody>) {
      mutationResponse = { ok: true, status: 200, body }
    },
    setMutationResponse(response: MutationResponse) {
      mutationResponse = response
    },
    clickRefreshAll() {
      ;(document.getElementById("refresh-all-button") as unknown as { click(): void }).click()
    },
    clickRead() {
      readButton().click()
    },
    clickBootstrapRetry() {
      ;(document.getElementById("bootstrap-retry-button") as unknown as { click(): void }).click()
    },
    clickEntriesRetry() {
      ;(document.getElementById("entries-retry-button") as unknown as { click(): void }).click()
    },
    clickLoadMore() {
      ;(document.getElementById("load-more-entries") as unknown as { click(): void }).click()
    },
    isReadDisabled() {
      return readButton().hasAttribute("disabled")
    },
    resetRequests,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("fallback Remote shell bootstrap and paging", () => {
  it("renders a static shell with stable retry controls before any script request", () => {
    const { document } = parseHTML(getRemoteShellHtml())

    expect(document.querySelector(".columns")).not.toBeNull()
    expect(document.getElementById("subscription-panel")?.textContent).toContain("Loading")
    expect(document.getElementById("bootstrap-retry-button")).not.toBeNull()
    expect(document.getElementById("entries-retry-button")).not.toBeNull()
    expect(document.querySelector('script[src="/remote.js"]')).not.toBeNull()
  })

  it("bootstraps metadata atomically and requests the first bounded page without a cursor", async () => {
    const script = getRemoteShellScript()
    expect(script).toContain('fetch("/api/bootstrap")')
    expect(script).not.toContain('fetch("/api/subscriptions")')
    expect(script).not.toContain('fetch("/api/unread")')
    expect(script).toContain('params.set("limit", "20")')
    expect(script).toContain('params.set("cursor", nextEntryCursor)')

    const harness = await createHarness()
    expect(harness.initialRequestUrls).toHaveLength(2)
    expect(harness.initialRequestUrls[0]).toBe("/api/bootstrap")
    const initialEntriesUrl = new URL(harness.initialRequestUrls[1]!, "http://remote.local")
    expect(initialEntriesUrl.pathname).toBe("/api/entries")
    expect(initialEntriesUrl.searchParams.get("feedId")).toBe("feed-active")
    expect(initialEntriesUrl.searchParams.get("limit")).toBe("20")
    expect(initialEntriesUrl.searchParams.has("cursor")).toBe(false)
  })

  it("keeps the static shell and exposes bootstrap retry after metadata failure", async () => {
    const harness = await createHarness({
      bootstrapResponses: [{ ok: false, status: 503, body: {} }],
      waitForInitialEntries: false,
    })
    const retry = harness.document.getElementById("bootstrap-retry-button")!

    await vi.waitFor(() => expect(retry.hidden).toBe(false))
    expect(harness.document.querySelector(".columns")).not.toBeNull()
    expect(harness.document.getElementById("subscription-panel")?.textContent).toContain("Loading")
    expect(harness.requests.entries).toBe(0)

    harness.clickBootstrapRetry()
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
    expect(harness.document.getElementById("bootstrap-state")?.hidden).toBe(true)
  })

  it("retains entry content and exposes entry retry after a page failure", async () => {
    const harness = await createHarness({
      entryResponses: [
        {
          body: {
            data: [
              { id: "entry-active", feedId: "feed-active", title: "Cached entry", read: false },
            ],
            page: { limit: 20, hasMore: false, nextCursor: null },
          },
        },
        { ok: false, status: 503, body: {} },
        {
          body: {
            data: [{ id: "entry-active", feedId: "feed-active", title: "Recovered", read: false }],
            page: { limit: 20, hasMore: false, nextCursor: null },
          },
        },
      ],
    })
    const retry = harness.document.getElementById("entries-retry-button")!

    harness.eventSource.emit("entries.updated", changeSet("entries-failure", ["feed-active"]))
    await vi.waitFor(() => expect(retry.hidden).toBe(false))
    expect(harness.document.querySelector(".columns")).not.toBeNull()
    expect(harness.document.getElementById("entry-panel")?.textContent).toContain("Cached entry")

    harness.clickEntriesRetry()
    await vi.waitFor(() =>
      expect(harness.document.getElementById("entry-panel")?.textContent).toContain("Recovered"),
    )
    expect(harness.requests.entries).toBe(2)
    const retryUrl = harness.requestUrls.filter((url) => url.startsWith("/api/entries?")).at(-1)!
    expect(retryUrl).toContain("limit=20")
    expect(retryUrl).not.toContain("cursor=")
  })

  it("sends the saved cursor once, appends the next page, and blocks duplicate pending loads", async () => {
    let resolveSecondPage!: (value: unknown) => void
    const secondPage = new Promise((resolve) => (resolveSecondPage = resolve))
    const harness = await createHarness({
      entryResponses: [
        {
          body: {
            data: [{ id: "entry-1", feedId: "feed-active", title: "Page one", read: false }],
            page: { limit: 20, hasMore: true, nextCursor: "opaque-page-2" },
          },
        },
        { body: secondPage },
      ],
    })

    harness.clickLoadMore()
    harness.clickLoadMore()
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
    const appendUrl = new URL(harness.requestUrls[0]!, "http://remote.local")
    expect(appendUrl.searchParams.get("limit")).toBe("20")
    expect(appendUrl.searchParams.getAll("cursor")).toEqual(["opaque-page-2"])
    expect(harness.document.getElementById("load-more-entries")?.hasAttribute("disabled")).toBe(
      true,
    )

    resolveSecondPage({
      data: [
        { id: "entry-1", feedId: "feed-active", title: "Page one", read: false },
        { id: "entry-2", feedId: "feed-active", title: "Page two", read: false },
      ],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })
    await vi.waitFor(() =>
      expect(harness.document.getElementById("entry-panel")?.textContent).toContain("Page two"),
    )

    const entryText = harness.document.getElementById("entry-panel")?.textContent
    expect(entryText).toContain("Page one")
    expect(entryText).toContain("Page two")
    expect(harness.document.querySelectorAll("[data-entry-id]")).toHaveLength(2)
    expect(harness.document.getElementById("load-more-entries")?.hidden).toBe(true)
  })

  it("resets refreshed entries to the first page without reusing the append cursor", async () => {
    const harness = await createHarness({
      entryResponses: [
        {
          body: {
            data: [{ id: "entry-1", feedId: "feed-active", title: "Page one", read: false }],
            page: { limit: 20, hasMore: true, nextCursor: "opaque-page-2" },
          },
        },
        {
          body: {
            data: [{ id: "entry-2", feedId: "feed-active", title: "Page two", read: false }],
            page: { limit: 20, hasMore: false, nextCursor: null },
          },
        },
        {
          body: {
            data: [{ id: "entry-fresh", feedId: "feed-active", title: "Fresh page", read: false }],
            page: { limit: 20, hasMore: false, nextCursor: null },
          },
        },
      ],
    })

    harness.clickLoadMore()
    await vi.waitFor(() =>
      expect(harness.document.getElementById("entry-panel")?.textContent).toContain("Page two"),
    )
    harness.resetRequests()

    harness.eventSource.emit("entries.updated", changeSet("refresh-reset", ["feed-active"]))
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
    const refreshUrl = new URL(
      harness.requestUrls.find((url) => url.startsWith("/api/entries?"))!,
      "http://remote.local",
    )
    expect(refreshUrl.searchParams.get("limit")).toBe("20")
    expect(refreshUrl.searchParams.has("cursor")).toBe(false)
    await vi.waitFor(() =>
      expect(harness.document.getElementById("entry-panel")?.textContent).toContain("Fresh page"),
    )
    expect(harness.document.getElementById("entry-panel")?.textContent).not.toContain("Page two")
  })

  it("resets a new feed selection to a bounded first page without a cursor", async () => {
    const harness = await createHarness({
      bootstrapResponses: [
        {
          body: {
            data: {
              subscriptions: [
                feedSubscription("feed-active", "Active"),
                feedSubscription("feed-second", "Second"),
              ],
              feeds: [
                { id: "feed-active", title: "Active", url: "" },
                { id: "feed-second", title: "Second", url: "" },
              ],
              unread: [],
              collections: [],
              settings: {},
              capabilities: {},
            },
          },
        },
      ],
      entryResponses: [
        {
          body: {
            data: [{ id: "entry-1", feedId: "feed-active", title: "Page one", read: false }],
            page: { limit: 20, hasMore: true, nextCursor: "opaque-page-2" },
          },
        },
        {
          body: {
            data: [{ id: "entry-2", feedId: "feed-second", title: "Second feed", read: false }],
            page: { limit: 20, hasMore: false, nextCursor: null },
          },
        },
      ],
    })

    ;(
      harness.document.querySelector('[data-feed-id="feed-second"]') as unknown as { click(): void }
    ).click()
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))

    const selectionUrl = new URL(harness.requestUrls[0]!, "http://remote.local")
    expect(selectionUrl.searchParams.get("feedId")).toBe("feed-second")
    expect(selectionUrl.searchParams.get("limit")).toBe("20")
    expect(selectionUrl.searchParams.has("cursor")).toBe(false)
  })

  it("coalesces pending ChangeSets into one strongest trailing recalibration", async () => {
    let resolvePendingBootstrap!: (value: unknown) => void
    const pendingBootstrap = new Promise((resolve) => (resolvePendingBootstrap = resolve))
    const harness = await createHarness({
      bootstrapResponses: [
        { body: bootstrapBody() },
        { body: pendingBootstrap },
        {
          body: bootstrapBody(
            [feedSubscription("feed-final", "Final feed")],
            [{ id: "feed-final", count: 2 }],
          ),
        },
      ],
      entryResponses: [
        {
          body: {
            data: [{ id: "entry-stale", feedId: "feed-active", title: "Stale row", read: false }],
            page: { limit: 20, hasMore: true, nextCursor: "stale-cursor" },
          },
        },
        {
          body: {
            data: [{ id: "entry-final", feedId: "feed-final", title: "Final row", read: false }],
            page: { limit: 20, hasMore: false, nextCursor: null },
          },
        },
      ],
    })

    harness.eventSource.emit("entries.updated", changeSet("pending-first", ["feed-unrelated"]))
    await vi.waitFor(() => expect(harness.requests.bootstrap).toBe(1))
    harness.eventSource.emit("entries.updated", changeSet("pending-second", ["feed-active"]))
    harness.eventSource.emit("entries.updated", changeSet("pending-third", ["feed-unrelated"]))
    await Promise.resolve()
    expect(harness.requests.bootstrap).toBe(1)

    resolvePendingBootstrap(bootstrapBody())
    await vi.waitFor(() => expect(harness.requests).toMatchObject({ bootstrap: 2, entries: 1 }))
    await vi.waitFor(() =>
      expect(harness.document.getElementById("entry-panel")?.textContent).toContain("Final row"),
    )

    const entryUrls = harness.requestUrls.filter((url) => url.startsWith("/api/entries?"))
    expect(entryUrls).toHaveLength(1)
    expect(new URL(entryUrls[0]!, "http://remote.local").searchParams.has("cursor")).toBe(false)
    expect(harness.document.querySelector('[data-feed-id="feed-final"]')?.className).toContain(
      "is-active",
    )
    expect(harness.document.getElementById("subscription-panel")?.textContent).not.toContain(
      "Active",
    )
    expect(harness.document.getElementById("entry-panel")?.textContent).not.toContain("Stale row")
  })

  it("replays reconnect calibration after entries from an earlier bootstrap are pending", async () => {
    let resolvePendingEntries!: (value: unknown) => void
    const pendingEntries = new Promise((resolve) => (resolvePendingEntries = resolve))
    const harness = await createHarness({
      bootstrapResponses: [
        { body: bootstrapBody() },
        { body: bootstrapBody() },
        {
          body: bootstrapBody(
            [feedSubscription("feed-reconnected", "Reconnected feed")],
            [{ id: "feed-reconnected", count: 1 }],
          ),
        },
      ],
      entryResponses: [
        {
          body: {
            data: [{ id: "entry-stale", feedId: "feed-active", title: "Stale row", read: false }],
            page: { limit: 20, hasMore: true, nextCursor: "stale-cursor" },
          },
        },
        { body: pendingEntries },
        {
          body: {
            data: [
              {
                id: "entry-reconnected",
                feedId: "feed-reconnected",
                title: "Reconnected row",
                read: false,
              },
            ],
            page: { limit: 20, hasMore: false, nextCursor: null },
          },
        },
      ],
    })

    harness.eventSource.emit(
      "subscriptions.updated",
      changeSet("subscription-pending", [], {
        reason: "subscription",
        scope: "all",
        refreshed: undefined,
      }),
    )
    await vi.waitFor(() => expect(harness.requests).toMatchObject({ bootstrap: 1, entries: 1 }))
    harness.eventSource.disconnect()
    harness.eventSource.emit("ready")
    await Promise.resolve()
    expect(harness.requests.bootstrap).toBe(1)

    resolvePendingEntries({
      data: [
        { id: "entry-intermediate", feedId: "feed-active", title: "Intermediate", read: false },
      ],
      page: { limit: 20, hasMore: true, nextCursor: "intermediate-cursor" },
    })
    await vi.waitFor(() => expect(harness.requests).toMatchObject({ bootstrap: 2, entries: 2 }))
    await vi.waitFor(() =>
      expect(harness.document.getElementById("entry-panel")?.textContent).toContain(
        "Reconnected row",
      ),
    )

    const entryUrls = harness.requestUrls.filter((url) => url.startsWith("/api/entries?"))
    expect(entryUrls).toHaveLength(2)
    expect(
      entryUrls.every((url) => !new URL(url, "http://remote.local").searchParams.has("cursor")),
    ).toBe(true)
    expect(
      harness.document.querySelector('[data-feed-id="feed-reconnected"]')?.className,
    ).toContain("is-active")
    expect(harness.document.getElementById("entry-panel")?.textContent).not.toContain("Stale row")
    expect(harness.document.getElementById("entry-panel")?.textContent).not.toContain(
      "Intermediate",
    )
  })

  it.each([
    [
      "subscription",
      {
        ...bootstrapBody(),
        data: {
          ...bootstrapBody().data,
          subscriptions: [
            feedSubscription("feed-new", "New feed"),
            { ...feedSubscription("feed-bad", "Bad feed"), feedId: " " },
          ],
        },
      },
    ],
    [
      "unread count",
      {
        ...bootstrapBody(),
        data: {
          ...bootstrapBody().data,
          subscriptions: [feedSubscription("feed-new", "New feed")],
          unread: [
            { id: "feed-new", count: 2 },
            { id: "feed-bad", count: -1 },
          ],
        },
      },
    ],
  ])(
    "retains the complete prior snapshot after a malformed %s record",
    async (_label, malformed) => {
      const harness = await createHarness({
        bootstrapResponses: [
          {
            body: bootstrapBody(
              [feedSubscription("feed-active", "Cached feed")],
              [{ id: "feed-active", count: 4 }],
            ),
          },
          { body: malformed },
        ],
        entryResponses: [
          {
            body: {
              data: [
                { id: "entry-cached", feedId: "feed-active", title: "Cached row", read: false },
              ],
              page: { limit: 20, hasMore: true, nextCursor: "cached-cursor" },
            },
          },
        ],
      })

      harness.eventSource.emit(
        "subscriptions.updated",
        changeSet(`malformed-${_label}`, [], {
          reason: "subscription",
          scope: "all",
          refreshed: undefined,
        }),
      )
      await vi.waitFor(() =>
        expect(harness.document.getElementById("bootstrap-retry-button")?.hidden).toBe(false),
      )

      expect(harness.requests).toMatchObject({ bootstrap: 1, entries: 0 })
      expect(harness.document.getElementById("bootstrap-state")?.hidden).toBe(false)
      expect(harness.document.getElementById("subscription-panel")?.textContent).toContain(
        "Cached feed",
      )
      expect(harness.document.getElementById("subscription-panel")?.textContent).toContain(
        "4 unread",
      )
      expect(harness.document.querySelector('[data-feed-id="feed-active"]')?.className).toContain(
        "is-active",
      )
      expect(harness.document.getElementById("subscription-panel")?.textContent).not.toContain(
        "New feed",
      )
      expect(harness.document.getElementById("entry-panel")?.textContent).toContain("Cached row")
    },
  )
})

describe("fallback Remote shell ChangeSet handling", () => {
  it.each([1, 10, 50])(
    "deduplicates a response-first %i-feed refresh and reloads active entries once",
    async (size) => {
      const harness = await createHarness()
      const refresh = changeSet(`response-${size}`, feedIds(size))
      harness.setMutationBody(Promise.resolve({ changeSet: refresh }))

      harness.clickRefreshAll()
      await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
      harness.eventSource.emit("entries.updated", refresh)
      await Promise.resolve()

      expect(harness.requests).toMatchObject({ entries: 1, bootstrap: 1 })
    },
  )

  it("deduplicates an SSE-first refresh before the mutation response resolves", async () => {
    const harness = await createHarness()
    const refresh = changeSet("sse-first", feedIds(10))
    let resolveResponse!: (body: ResponseBody) => void
    harness.setMutationBody(new Promise((resolve) => (resolveResponse = resolve)))

    harness.clickRefreshAll()
    await vi.waitFor(() => expect(harness.requests.mutations).toBe(1))
    harness.eventSource.emit("entries.updated", refresh)
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
    resolveResponse({ changeSet: refresh })
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.requests).toMatchObject({ entries: 1, bootstrap: 1 })
  })

  it("compensates once on the first ready after a disconnected interval", async () => {
    const harness = await createHarness()

    harness.eventSource.emit("ready")
    await Promise.resolve()
    expect(harness.requests).toMatchObject({ entries: 0, bootstrap: 0 })

    harness.eventSource.disconnect()
    harness.eventSource.emit("ready")
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
    harness.eventSource.emit("ready")
    await Promise.resolve()

    expect(harness.requests).toMatchObject({ entries: 1, bootstrap: 1 })
  })

  it("deduplicates a response-first read mutation and its later SSE event", async () => {
    const harness = await createHarness()
    const read = changeSet("read-response-first", [], {
      reason: "read",
      scope: "all",
      entryIds: ["entry-active"],
      refreshed: undefined,
    })
    harness.setMutationBody(Promise.resolve({ changeSet: read }))

    harness.clickRead()
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
    harness.eventSource.emit("entries.updated", read)
    await Promise.resolve()

    expect(harness.requests).toMatchObject({ entries: 1, bootstrap: 1 })
  })

  it("deduplicates an SSE-first read before the mutation response resolves", async () => {
    const harness = await createHarness()
    const read = changeSet("read-sse-first", [], {
      reason: "read",
      scope: "all",
      entryIds: ["entry-active"],
      refreshed: undefined,
    })
    let resolveResponse!: (body: ResponseBody) => void
    harness.setMutationBody(new Promise((resolve) => (resolveResponse = resolve)))

    harness.clickRead()
    await vi.waitFor(() => expect(harness.requests.mutations).toBe(1))
    harness.eventSource.emit("entries.updated", read)
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
    resolveResponse({ changeSet: read })
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.requests).toMatchObject({ entries: 1, bootstrap: 1 })
  })

  it("restores the read button without calibration for a JSON non-2xx response", async () => {
    const harness = await createHarness()
    const read = changeSet("read-failed", [], {
      reason: "read",
      scope: "all",
      entryIds: ["entry-active"],
      refreshed: undefined,
    })
    harness.setMutationResponse({
      ok: false,
      status: 503,
      body: Promise.resolve({ changeSet: read }),
    })

    harness.clickRead()
    await vi.waitFor(() => expect(harness.requests.mutations).toBe(1))
    await vi.waitFor(() => expect(harness.isReadDisabled()).toBe(false))

    expect(harness.requests).toMatchObject({ entries: 0, bootstrap: 0 })
  })

  it("uses only successful feed scope for partial refreshes", async () => {
    const harness = await createHarness()
    harness.eventSource.emit(
      "entries.updated",
      changeSet("partial-unrelated", ["feed-success"], { failed: 9 }),
    )
    await vi.waitFor(() => expect(harness.requests.bootstrap).toBe(1))
    await vi.waitFor(() =>
      expect(harness.document.getElementById("bootstrap-state")?.hidden).toBe(true),
    )

    expect(harness.requests).toMatchObject({ entries: 0, bootstrap: 1 })

    harness.resetRequests()
    harness.eventSource.emit(
      "entries.updated",
      changeSet("partial-active", ["feed-active", "feed-success"], { failed: 8 }),
    )
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))

    expect(harness.requests).toMatchObject({ entries: 1, bootstrap: 1 })
  })

  it("does no refresh work for a zero-success batch", async () => {
    const harness = await createHarness()
    const refresh = changeSet("zero-success", [], { failed: 10 })
    harness.setMutationBody(Promise.resolve({ changeSet: refresh }))

    harness.clickRefreshAll()
    await vi.waitFor(() => expect(harness.requests.mutations).toBe(1))
    harness.eventSource.emit("entries.updated", refresh)
    await Promise.resolve()

    expect(harness.requests).toMatchObject({ entries: 0, bootstrap: 0 })
  })

  it("keeps read, collection, subscription, and import events coherent with shell surfaces", async () => {
    const harness = await createHarness()

    harness.eventSource.emit(
      "entries.updated",
      changeSet("read", [], {
        reason: "read",
        scope: "all",
        entryIds: ["entry-active"],
        refreshed: undefined,
      }),
    )
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
    await vi.waitFor(() =>
      expect(harness.document.getElementById("bootstrap-state")?.hidden).toBe(true),
    )
    expect(harness.requests).toMatchObject({ entries: 1, bootstrap: 1 })

    harness.resetRequests()
    harness.eventSource.emit(
      "entries.updated",
      changeSet("collection", [], {
        reason: "collection",
        scope: "all",
        entryIds: ["entry-active"],
        refreshed: undefined,
      }),
    )
    await Promise.resolve()
    expect(harness.requests).toMatchObject({ entries: 0, bootstrap: 0 })

    for (const reason of ["subscription", "import"] as const) {
      harness.eventSource.emit(
        "subscriptions.updated",
        changeSet(reason, [], { reason, scope: "all", refreshed: undefined }),
      )
      await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
      await vi.waitFor(() =>
        expect(harness.document.getElementById("bootstrap-state")?.hidden).toBe(true),
      )
      expect(harness.requests).toMatchObject({ entries: 1, bootstrap: 1 })
      harness.resetRequests()
    }
  })

  it("keeps processed batch IDs bounded to 512 and expires them after five minutes", async () => {
    const harness = await createHarness()
    let now = 1
    vi.spyOn(Date, "now").mockImplementation(() => now)

    for (let index = 0; index < 513; index += 1) {
      harness.eventSource.emit("entries.updated", changeSet(`bounded-${index}`, []))
    }
    harness.eventSource.emit("entries.updated", changeSet("bounded-0", ["feed-active"]))
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
    await vi.waitFor(() =>
      expect(harness.document.getElementById("bootstrap-state")?.hidden).toBe(true),
    )

    harness.resetRequests()
    harness.eventSource.emit("entries.updated", changeSet("ttl", []))
    now += 5 * 60 * 1000 + 1
    harness.eventSource.emit("entries.updated", changeSet("ttl", ["feed-active"]))
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))

    expect(harness.requests).toMatchObject({ entries: 1, bootstrap: 1 })
  })
})
