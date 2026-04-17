import { beforeEach, describe, expect, it, vi } from "vitest"

const feedState = {
  feeds: {
    feed_1: {
      id: "feed_1",
      url: "https://example.com/rss.xml",
      title: "Example Feed",
      siteUrl: "https://example.com",
      type: "feed",
    },
  },
}

const subscriptionState = {
  data: {
    "feed/feed_1": {
      feedId: "feed_1",
      listId: null,
      inboxId: null,
      type: "feed",
      view: 0,
      category: "news",
      title: "Example Feed",
      isPrivate: false,
      hideFromTimeline: false,
    },
  },
}

const feedUpsertManyInSession = vi.fn()
const subscriptionReplaceManyInSession = vi.fn()
const unreadRestoreHydratedSnapshotInSession = vi.fn()
const entryRestoreHydratedSnapshotInSession = vi.fn()
const noopUnsubscribe = vi.fn()

vi.mock("@suhui/store/feed/store", () => ({
  feedActions: {
    upsertManyInSession: feedUpsertManyInSession,
  },
  useFeedStore: {
    getState: () => feedState,
    subscribe: vi.fn(() => noopUnsubscribe),
  },
}))

vi.mock("@suhui/store/subscription/store", () => ({
  subscriptionActions: {
    replaceManyInSession: subscriptionReplaceManyInSession,
  },
  useSubscriptionStore: {
    getState: () => subscriptionState,
    subscribe: vi.fn(() => noopUnsubscribe),
  },
}))

vi.mock("@suhui/store/unread/store", () => ({
  unreadActions: {
    restoreHydratedSnapshotInSession: unreadRestoreHydratedSnapshotInSession,
  },
  useUnreadStore: {
    getState: () => ({
      data: {
        feed_1: 3,
      },
    }),
    subscribe: vi.fn(() => noopUnsubscribe),
  },
}))

vi.mock("@suhui/store/entry/base", () => ({
  useEntryStore: {
    getState: () => ({
      data: {
        entry_1: {
          id: "entry_1",
          feedId: "feed_1",
          inboxHandle: null,
          title: "Entry 1",
          description: "Summary 1",
          publishedAt: 1,
          insertedAt: 1,
          read: false,
          sources: [],
          author: "Author 1",
        },
      },
      entryIdByFeed: {
        feed_1: new Set(["entry_1"]),
      },
      entryIdByInbox: {},
      entryIdByView: {
        0: new Set(["entry_1"]),
      },
    }),
    subscribe: vi.fn(() => noopUnsubscribe),
  },
}))

vi.mock("@suhui/store/entry/store", () => ({
  entryActions: {
    restoreHydratedSnapshotInSession: entryRestoreHydratedSnapshotInSession,
  },
}))

vi.mock("@suhui/store/hydrate-phases", () => ({
  getHydratePhaseState: vi.fn(() => ({
    currentSource: null,
  })),
  runWithHydrateSource: vi.fn((_: unknown, fn: () => unknown) => fn()),
}))

vi.mock("@suhui/store/user/store", () => ({
  LOCAL_USER_ID: "local_user_id",
  useUserStore: {
    getState: () => ({
      whoami: {
        id: "local_user_id",
      },
    }),
  },
}))

vi.mock("~/lib/client", () => ({
  getRendererDbConfig: vi.fn().mockResolvedValue({
    dbConn: "postgres://localhost/suhui",
  }),
}))

vi.mock("~/hooks/biz/useRouteParams", () => ({
  getRouteParams: vi.fn(() => ({
    view: 0,
    feedId: "feed_1",
    inboxId: undefined,
  })),
}))

const { clearRendererQueryCache } = await import("~/lib/query-client")
const {
  STARTUP_SNAPSHOT_VERSION,
  clearStartupSnapshot,
  emitStartupSnapshotUserWrite,
  flushStartupSnapshot,
  forceStartupSnapshotRefresh,
  getStartupSnapshotStorageKeyForTests,
  initializeStartupSnapshot,
  markStartupSnapshotInteractive,
  resetStartupSnapshotForTests,
  restoreStartupSnapshot,
} = await import("./startup-snapshot")

describe("startup snapshot", () => {
  const createStorage = () => {
    const store = new Map<string, string>()
    return {
      get length() {
        return store.size
      },
      key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
      clear: vi.fn(() => {
        store.clear()
      }),
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    feedUpsertManyInSession.mockReset()
    subscriptionReplaceManyInSession.mockReset()
    unreadRestoreHydratedSnapshotInSession.mockReset()
    entryRestoreHydratedSnapshotInSession.mockReset()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createStorage(),
    })
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: createStorage(),
    })
    localStorage.clear()
    resetStartupSnapshotForTests()
  })

  it("restores canonical rows from a valid snapshot", async () => {
    initializeStartupSnapshot({ startupSessionId: "startup-1" })
    const key = await getStartupSnapshotStorageKeyForTests()

    localStorage.setItem(
      key,
      JSON.stringify({
        version: STARTUP_SNAPSHOT_VERSION,
        savedAt: Date.now(),
        startupSessionId: "startup-0",
        dbIdentity: "postgres://localhost/suhui",
        userIdentity: "local_user_id",
        feeds: [
          {
            id: "feed_1",
            url: "https://example.com/rss.xml",
            title: "Example Feed",
            siteUrl: "https://example.com",
          },
        ],
        subscriptions: [
          {
            id: "feed/feed_1",
            feedId: "feed_1",
            listId: null,
            inboxId: null,
            type: "feed",
            view: 0,
            category: "news",
            title: "Example Feed",
            isPrivate: false,
            hideFromTimeline: false,
          },
        ],
        unreads: [{ id: "feed_1", count: 3 }],
        entries: [
          {
            id: "entry_1",
            feedId: "feed_1",
            inboxHandle: null,
            title: "Entry 1",
            summary: "Summary 1",
            publishedAt: 1,
            insertedAt: 1,
            read: false,
            sources: [],
            author: "Author 1",
          },
        ],
      }),
    )

    await expect(restoreStartupSnapshot()).resolves.toBe("hit")
    expect(feedUpsertManyInSession).toHaveBeenCalledTimes(1)
    expect(subscriptionReplaceManyInSession).toHaveBeenCalledTimes(1)
    expect(unreadRestoreHydratedSnapshotInSession).toHaveBeenCalledTimes(1)
    expect(entryRestoreHydratedSnapshotInSession).toHaveBeenCalledTimes(1)
  })

  it("treats malformed snapshots as corrupt without blocking startup", async () => {
    initializeStartupSnapshot({ startupSessionId: "startup-2" })
    const key = await getStartupSnapshotStorageKeyForTests()
    localStorage.setItem(key, "{bad json")

    await expect(restoreStartupSnapshot()).resolves.toBe("corrupt")
  })

  it("treats older snapshot payload versions as old_version", async () => {
    initializeStartupSnapshot({ startupSessionId: "startup-2b" })
    const key = await getStartupSnapshotStorageKeyForTests()
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 0,
        feeds: [],
        subscriptions: [],
        unreads: [],
        entries: [],
        dbIdentity: "postgres://localhost/suhui",
        userIdentity: "local_user_id",
      }),
    )

    await expect(restoreStartupSnapshot()).resolves.toBe("old_version")
  })

  it("writes the first snapshot only after interactive, debounces user writes, and flushes on lifecycle/reset", async () => {
    initializeStartupSnapshot({ startupSessionId: "startup-3", debounceMs: 400 })
    const key = await getStartupSnapshotStorageKeyForTests()

    emitStartupSnapshotUserWrite()
    await vi.advanceTimersByTimeAsync(500)
    expect(localStorage.getItem(key)).toBeNull()

    await markStartupSnapshotInteractive()
    const firstSnapshot = JSON.parse(localStorage.getItem(key) || "null")
    expect(firstSnapshot).toMatchObject({
      version: STARTUP_SNAPSHOT_VERSION,
      startupSessionId: "startup-3",
      feeds: [{ id: "feed_1", title: "Example Feed" }],
      subscriptions: [{ id: "feed/feed_1", feedId: "feed_1" }],
    })
    expect(firstSnapshot.feeds[0]).not.toHaveProperty("type")

    emitStartupSnapshotUserWrite()
    emitStartupSnapshotUserWrite()
    await vi.advanceTimersByTimeAsync(399)
    expect(JSON.parse(localStorage.getItem(key) || "null").savedAt).toBe(firstSnapshot.savedAt)

    await vi.advanceTimersByTimeAsync(1)
    const debouncedSnapshot = JSON.parse(localStorage.getItem(key) || "null")
    expect(debouncedSnapshot.savedAt).toBeGreaterThanOrEqual(firstSnapshot.savedAt)

    emitStartupSnapshotUserWrite()
    document.dispatchEvent(new Event("electron-close"))
    await vi.runAllTimersAsync()
    const flushedSnapshot = JSON.parse(localStorage.getItem(key) || "null")
    expect(flushedSnapshot.savedAt).toBeGreaterThanOrEqual(debouncedSnapshot.savedAt)

    emitStartupSnapshotUserWrite()
    await clearRendererQueryCache()
    expect(localStorage.getItem(key)).toBeNull()
  })

  it("forces a snapshot refresh after hydrateCriticalDone and supports explicit clear", async () => {
    initializeStartupSnapshot({ startupSessionId: "startup-4" })
    const key = await getStartupSnapshotStorageKeyForTests()

    await markStartupSnapshotInteractive()
    const initialSavedAt = JSON.parse(localStorage.getItem(key) || "null").savedAt

    await forceStartupSnapshotRefresh()
    const forcedSavedAt = JSON.parse(localStorage.getItem(key) || "null").savedAt
    expect(forcedSavedAt).toBeGreaterThanOrEqual(initialSavedAt)

    await flushStartupSnapshot("visibility_hidden")
    await clearStartupSnapshot()
    expect(localStorage.getItem(key)).toBeNull()
  })
})
