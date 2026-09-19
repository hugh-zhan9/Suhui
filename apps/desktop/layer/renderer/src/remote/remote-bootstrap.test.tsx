import { act, useLayoutEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  applyBootstrap: vi.fn(),
  annotationsList: vi.fn(),
  beginBootstrap: vi.fn(),
  bootstrapGet: vi.fn(),
  connectSSE: vi.fn(),
  connectionHandler: undefined as ((connected: boolean) => void) | undefined,
  entriesQuery: vi.fn(),
  failBootstrap: vi.fn(),
  markDataReady: vi.fn(
    (_input: { bootstrapReady: boolean; initialEntriesReady: boolean }): number | null => null,
  ),
  markMetric: vi.fn((_name: string) => 1),
  mobile: false,
  refetchEntries: vi.fn(),
  subscriptions: {} as Record<string, unknown>,
}))

// setup-file.ts swaps in a minimal window stub, so the real hook's
// getComputedStyle/transition work has nothing to run against.
vi.mock("@suhui/hooks", () => ({ useSyncThemeWebApp: () => {} }))
vi.mock("@suhui/store/collection/hooks", () => ({ useIsEntryStarred: () => false }))
vi.mock("@suhui/store/collection/store", () => ({
  collectionActions: { deleteInSession: vi.fn(), upsertManyInSession: vi.fn() },
  useCollectionStore: { getState: () => ({ collections: {} }) },
}))
vi.mock("@suhui/store/entry/getter", () => ({ getEntry: () => null }))
vi.mock("@suhui/store/entry/hooks", () => ({
  useEntriesQuery: (...args: unknown[]) => mocks.entriesQuery(...args),
  useEntry: () => undefined,
}))
vi.mock("@suhui/store/entry/store", () => ({
  entrySyncServices: { fetchEntryDetail: vi.fn() },
}))
vi.mock("@suhui/store/feed/hooks", () => ({ useFeedById: () => undefined }))
vi.mock("@suhui/store/remote", () => ({
  applyRemoteBootstrapInSession: (...args: unknown[]) => mocks.applyBootstrap(...args),
  beginRemoteBootstrapLoading: (...args: unknown[]) => mocks.beginBootstrap(...args),
  failRemoteBootstrapLoading: (...args: unknown[]) => mocks.failBootstrap(...args),
  remoteSSEHandler: {
    connect: (...args: unknown[]) => mocks.connectSSE(...args),
    disconnect: vi.fn(),
    setHandlers: vi.fn(({ onConnectionChange }) => {
      mocks.connectionHandler = onConnectionChange
      onConnectionChange(false)
    }),
  },
}))
vi.mock("@suhui/store/runtime", () => ({
  runtimeClient: {
    bootstrap: { get: (...args: unknown[]) => mocks.bootstrapGet(...args) },
    annotations: { list: (...args: unknown[]) => mocks.annotationsList(...args) },
    collections: { updateEntryStar: vi.fn() },
    entries: {},
    feeds: { preview: vi.fn(), refresh: vi.fn() },
    importExport: { exportData: vi.fn(), importData: vi.fn() },
    pdf: { exportEntry: vi.fn() },
    rsshub: { precheck: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
    subscriptions: {
      batchUpdate: vi.fn(),
      create: vi.fn(),
      deleteByTargets: vi.fn(),
      updateById: vi.fn(),
    },
  },
}))
vi.mock("@suhui/store/subscription/store", () => ({
  useSubscriptionStore: () => ({ data: mocks.subscriptions }),
}))
vi.mock("@suhui/store/unread/store", () => ({
  unreadSyncService: { markRead: vi.fn(), markUnread: vi.fn() },
  useUnreadStore: () => ({ data: {} }),
}))
vi.mock("./remote-performance", () => ({
  markRemoteDataReadyIfComplete: (input: {
    bootstrapReady: boolean
    initialEntriesReady: boolean
  }) => mocks.markDataReady(input),
  markRemoteMetric: (name: string) => mocks.markMetric(name),
}))

import { RemoteApp } from "./remote-app"
import { useRemoteBootstrap } from "./remote-bootstrap"
import { markRemoteMetric } from "./remote-performance"

const validPayload = {
  capabilities: {},
  collections: [],
  feeds: [],
  settings: { appearance: "system", rsshubCustomUrl: "" },
  subscriptions: [],
  unread: [],
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function BootstrapHarness() {
  const bootstrap = useRemoteBootstrap()
  useLayoutEffect(() => {
    markRemoteMetric("remote_shell_visible_ms")
  }, [])
  return (
    <div data-testid="shell">
      <span>{bootstrap.phase}</span>
      {bootstrap.phase === "error" && <button onClick={bootstrap.retry}>重试加载订阅</button>}
    </div>
  )
}

describe("remote progressive bootstrap", () => {
  let container: HTMLDivElement
  let root: Root

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: mocks.mobile && query.includes("max-width"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  })

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    mocks.subscriptions = {}
    mocks.mobile = false
    mocks.connectionHandler = undefined
    mocks.connectSSE.mockReset()
    mocks.entriesQuery.mockReturnValue({
      entriesIds: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: true,
      isSuccess: false,
      refetch: mocks.refetchEntries,
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it("commits the shell before the delayed bootstrap request starts", async () => {
    const request = deferred<typeof validPayload>()
    const order: string[] = []
    mocks.markMetric.mockImplementation((name) => {
      if (name === "remote_shell_visible_ms") order.push("commit")
      return 1
    })
    mocks.bootstrapGet.mockImplementation(() => {
      order.push("request")
      return request.promise
    })

    await act(async () => root.render(<BootstrapHarness />))

    expect(container.querySelector('[data-testid="shell"]')).not.toBeNull()
    expect(container.textContent).toContain("loading")
    expect(order.slice(0, 2)).toEqual(["commit", "request"])

    await act(async () => request.resolve(validPayload))
    expect(container.textContent).toContain("ready")
  })

  it("keeps the mounted shell and retries rejected metadata", async () => {
    mocks.bootstrapGet
      .mockRejectedValueOnce(new Error("bootstrap failed"))
      .mockResolvedValueOnce(validPayload)

    await act(async () => root.render(<BootstrapHarness />))
    expect(container.textContent).toContain("重试加载订阅")

    const retry = container.querySelector("button")!
    await act(async () => retry.dispatchEvent(new MouseEvent("click", { bubbles: true })))

    expect(mocks.bootstrapGet).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain("ready")
  })

  it("keeps metadata mounted when entries fail and never counts the error as data ready", async () => {
    mocks.subscriptions = {
      "feed/feed-1": {
        category: null,
        feedId: "feed-1",
        title: "Example Feed",
        type: "feed",
        view: 1,
      },
    }
    mocks.bootstrapGet.mockResolvedValue(validPayload)
    mocks.entriesQuery.mockReturnValue({
      entriesIds: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: true,
      isFetchingNextPage: false,
      isLoading: false,
      isSuccess: false,
      refetch: mocks.refetchEntries,
    })

    await act(async () => root.render(<RemoteApp />))

    expect(container.querySelector('[data-testid="remote-reader-shell"]')).not.toBeNull()
    expect(container.textContent).toContain("Example Feed")
    expect(container.textContent).toContain("重试加载文章")
    expect(mocks.markMetric).toHaveBeenCalledWith("remote_entries_error_visible_ms")
    expect(mocks.markMetric).not.toHaveBeenCalledWith("remote_initial_entries_ready_ms")
    expect(mocks.markDataReady).not.toHaveBeenCalledWith({
      bootstrapReady: true,
      initialEntriesReady: true,
    })

    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "重试加载文章",
    )!
    await act(async () => retry.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    expect(mocks.refetchEntries).toHaveBeenCalledTimes(1)
  })

  it("keeps all reader panes mounted when metadata fails", async () => {
    mocks.bootstrapGet.mockRejectedValue(new Error("metadata unavailable"))

    await act(async () => root.render(<RemoteApp />))

    expect(container.querySelector('[data-testid="remote-reader-shell"]')).not.toBeNull()
    expect(container.querySelector(".remote-desktop-sidebar")).not.toBeNull()
    expect(container.querySelector(".remote-desktop-timeline")).not.toBeNull()
    expect(container.querySelector(".remote-desktop-reader-pane")).not.toBeNull()
    expect(container.textContent).toContain("重试加载订阅")
    expect(container.textContent).toContain("等待订阅加载")
    expect(mocks.markMetric).toHaveBeenCalledWith("remote_bootstrap_error_visible_ms")
    expect(mocks.markMetric).not.toHaveBeenCalledWith("remote_bootstrap_ready_ms")
    expect(mocks.markMetric).not.toHaveBeenCalledWith("remote_initial_entries_ready_ms")
  })

  it("treats a successful empty first page as ready without waiting for SSE", async () => {
    mocks.bootstrapGet.mockResolvedValue(validPayload)
    mocks.entriesQuery.mockReturnValue({
      entriesIds: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      isSuccess: true,
      refetch: mocks.refetchEntries,
    })

    await act(async () => root.render(<RemoteApp />))

    expect(container.textContent).toContain("该视图下没有订阅")
    expect(mocks.markMetric).toHaveBeenCalledWith("remote_initial_entries_ready_ms")
    expect(mocks.markDataReady).toHaveBeenCalledWith({
      bootstrapReady: true,
      initialEntriesReady: true,
    })
    expect(container.textContent).toContain("连接中")

    await act(async () => mocks.connectionHandler?.(true))
    expect(container.textContent).toContain("已连接")
    await act(async () => mocks.connectionHandler?.(false))
    expect(container.textContent).toContain("已断开")
  })

  it("shows disconnected when the first SSE connection fails before ready and can recover", async () => {
    mocks.bootstrapGet.mockResolvedValue(validPayload)
    mocks.connectSSE.mockImplementation(() => mocks.connectionHandler?.(false))

    await act(async () => root.render(<RemoteApp />))

    expect(container.textContent).toContain("已断开")

    await act(async () => mocks.connectionHandler?.(true))
    expect(container.textContent).toContain("已连接")
  })

  it("renders the app-shaped chrome and only the timeline pane on a phone", async () => {
    mocks.mobile = true
    mocks.bootstrapGet.mockResolvedValue(validPayload)

    await act(async () => root.render(<RemoteApp />))

    expect(container.querySelector(".remote-mobile-tabbar")).not.toBeNull()
    expect(container.querySelector(".remote-desktop-sidebar.remote-pane-hidden")).not.toBeNull()
    expect(container.querySelector(".remote-desktop-timeline.remote-pane-hidden")).toBeNull()
    expect(container.querySelector(".remote-desktop-reader-pane.remote-pane-hidden")).not.toBeNull()
  })

  it("moves between bottom tabs and keeps the timeline as their root", async () => {
    mocks.mobile = true
    mocks.bootstrapGet.mockResolvedValue(validPayload)

    await act(async () => root.render(<RemoteApp />))

    const tabFor = (label: string) =>
      [...container.querySelectorAll(".remote-mobile-tab")].find((node) =>
        node.textContent?.includes(label),
      ) as HTMLElement

    await act(async () => tabFor("订阅").dispatchEvent(new MouseEvent("click", { bubbles: true })))
    expect(container.querySelector(".remote-desktop-sidebar.remote-pane-hidden")).toBeNull()
    expect(container.querySelector(".remote-desktop-timeline.remote-pane-hidden")).not.toBeNull()

    await act(async () => tabFor("阅读").dispatchEvent(new MouseEvent("click", { bubbles: true })))
    expect(container.querySelector(".remote-desktop-sidebar.remote-pane-hidden")).not.toBeNull()
    expect(container.querySelector(".remote-desktop-timeline.remote-pane-hidden")).toBeNull()
  })

  it("does not expose or request private reading controls without the peer capability", async () => {
    mocks.bootstrapGet.mockResolvedValue(validPayload)
    mocks.entriesQuery.mockReturnValue({
      entriesIds: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      isSuccess: true,
      refetch: mocks.refetchEntries,
    })

    await act(async () => root.render(<RemoteApp />))

    expect(container.textContent).not.toContain("稍后读")
    expect(container.textContent).not.toContain("笔记与高亮")
    expect(mocks.annotationsList).not.toHaveBeenCalled()
  })
})
