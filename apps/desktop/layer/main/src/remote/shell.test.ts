import { parseHTML } from "linkedom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { getRemoteShellScript } from "./shell"

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

const createHarness = async () => {
  const { document } = parseHTML(`<!doctype html><html><body>
    <div id="remote-root"></div>
    <div id="subscription-panel"></div>
    <div id="entry-panel"></div>
    <div id="remote-status"></div>
    <button id="refresh-all-button"></button>
    <button id="refresh-feed-button"></button>
  </body></html>`)
  const requests = { entries: 0, unread: 0, subscriptions: 0, mutations: 0 }
  let mutationResponse: MutationResponse = {
    ok: true,
    status: 200,
    body: Promise.resolve({ changeSet: changeSet("default", ["feed-active"]) }),
  }

  const response = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
  const fetch = vi.fn(async (input: string, init?: { method?: string }) => {
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
      return response({
        data: [{ id: "entry-active", feedId: "feed-active", title: "Active entry", read: false }],
        page: { nextCursor: null },
      })
    }
    if (input === "/api/unread") {
      requests.unread += 1
      return response({ data: [{ id: "feed-active", count: 1 }] })
    }
    if (input === "/api/subscriptions") {
      requests.subscriptions += 1
      return response({ data: [{ id: "sub-active", feedId: "feed-active", title: "Active" }] })
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
  await vi.waitFor(() => expect(requests.entries).toBe(1))

  const resetRequests = () => {
    requests.entries = 0
    requests.unread = 0
    requests.subscriptions = 0
    requests.mutations = 0
  }
  const readButton = () =>
    document.querySelector('[data-entry-id="entry-active"]') as unknown as {
      click(): void
      hasAttribute(name: string): boolean
    }
  resetRequests()

  return {
    requests,
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
    isReadDisabled() {
      return readButton().hasAttribute("disabled")
    },
    resetRequests,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
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

      expect(harness.requests).toMatchObject({ entries: 1, unread: 1, subscriptions: 0 })
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

    expect(harness.requests).toMatchObject({ entries: 1, unread: 1, subscriptions: 0 })
  })

  it("compensates once on the first ready after a disconnected interval", async () => {
    const harness = await createHarness()

    harness.eventSource.emit("ready")
    await Promise.resolve()
    expect(harness.requests).toMatchObject({ entries: 0, unread: 0, subscriptions: 0 })

    harness.eventSource.disconnect()
    harness.eventSource.emit("ready")
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
    harness.eventSource.emit("ready")
    await Promise.resolve()

    expect(harness.requests).toMatchObject({ entries: 1, unread: 1, subscriptions: 1 })
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

    expect(harness.requests).toMatchObject({ entries: 1, unread: 1, subscriptions: 0 })
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

    expect(harness.requests).toMatchObject({ entries: 1, unread: 1, subscriptions: 0 })
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

    expect(harness.requests).toMatchObject({ entries: 0, unread: 0, subscriptions: 0 })
  })

  it("uses only successful feed scope for partial refreshes", async () => {
    const harness = await createHarness()
    harness.eventSource.emit(
      "entries.updated",
      changeSet("partial-unrelated", ["feed-success"], { failed: 9 }),
    )
    await vi.waitFor(() => expect(harness.requests.unread).toBe(1))

    expect(harness.requests).toMatchObject({ entries: 0, unread: 1, subscriptions: 0 })

    harness.resetRequests()
    harness.eventSource.emit(
      "entries.updated",
      changeSet("partial-active", ["feed-active", "feed-success"], { failed: 8 }),
    )
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))

    expect(harness.requests).toMatchObject({ entries: 1, unread: 1, subscriptions: 0 })
  })

  it("does no refresh work for a zero-success batch", async () => {
    const harness = await createHarness()
    const refresh = changeSet("zero-success", [], { failed: 10 })
    harness.setMutationBody(Promise.resolve({ changeSet: refresh }))

    harness.clickRefreshAll()
    await vi.waitFor(() => expect(harness.requests.mutations).toBe(1))
    harness.eventSource.emit("entries.updated", refresh)
    await Promise.resolve()

    expect(harness.requests).toMatchObject({ entries: 0, unread: 0, subscriptions: 0 })
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
    expect(harness.requests).toMatchObject({ entries: 1, unread: 1, subscriptions: 0 })

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
    expect(harness.requests).toMatchObject({ entries: 0, unread: 0, subscriptions: 0 })

    for (const reason of ["subscription", "import"] as const) {
      harness.eventSource.emit(
        "subscriptions.updated",
        changeSet(reason, [], { reason, scope: "all", refreshed: undefined }),
      )
      await vi.waitFor(() => expect(harness.requests.entries).toBe(1))
      expect(harness.requests).toMatchObject({ entries: 1, unread: 1, subscriptions: 1 })
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

    harness.resetRequests()
    harness.eventSource.emit("entries.updated", changeSet("ttl", []))
    now += 5 * 60 * 1000 + 1
    harness.eventSource.emit("entries.updated", changeSet("ttl", ["feed-active"]))
    await vi.waitFor(() => expect(harness.requests.entries).toBe(1))

    expect(harness.requests).toMatchObject({ entries: 1, unread: 1, subscriptions: 0 })
  })
})
