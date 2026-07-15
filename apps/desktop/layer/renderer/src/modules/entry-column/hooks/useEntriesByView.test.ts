import { FeedViewType } from "@suhui/constants"
import { entrySyncServices } from "@suhui/store/entry/store"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getStartupReadiness } from "~/atoms/app"
import {
  beginStartupSession,
  markRouteScopeReady,
  resetStartupReadinessForTests,
} from "~/initialize/readiness"
import {
  getStartupCountMetricsForTests,
  getStartupMetricsForTests,
} from "~/initialize/startup-metrics"

const testState = vi.hoisted(() => ({
  route: null as any,
  isRemote: false,
  unreadOnly: false,
  query: {
    data: undefined as any,
    dataUpdatedAt: 0,
    entriesIds: [] as string[],
    error: null as Error | null,
    fetchNextPage: vi.fn(async () => {}),
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    isRefetching: false,
    isSuccess: false,
    queryKey: ["entries"] as readonly unknown[],
    refetch: vi.fn(async () => {}),
  },
  queryProps: [] as any[],
  requests: [] as any[],
}))

vi.mock("@suhui/store/entry/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@suhui/store/entry/hooks")>()
  const React = await import("react")
  return {
    ...actual,
    useEntriesQuery: (props: any) => {
      testState.queryProps.push(props)
      React.useEffect(() => {
        if (props?.enabled !== false) testState.requests.push(props)
      }, [props?.enabled, JSON.stringify(props)])
      return testState.query
    },
  }
})
vi.mock("@suhui/store/remote", () => ({
  getRuntimeEnv: () => ({ isRemote: testState.isRemote }),
}))
vi.mock("@suhui/store/subscription/hooks", () => ({
  useFolderFeedsByFeedId: () => [],
  useIsSubscribed: () => false,
}))
vi.mock("@suhui/store/unread/store", () => ({
  unreadSyncService: { resetFromRemote: vi.fn() },
}))
vi.mock("~/atoms/settings/general", () => ({
  useGeneralSettingKey: (key: string) =>
    key === "unreadOnly"
      ? testState.unreadOnly
      : key === "hidePrivateSubscriptionsInTimeline"
        ? false
        : undefined,
}))
vi.mock("~/hooks/biz/useRouteParams", () => ({
  useRouteParams: () => testState.route,
}))

import * as entriesByView from "./useEntriesByView"
import { usePrefetchEntryDetail } from "@suhui/store/entry/hooks"

const route = (overrides: Record<string, unknown> = {}) =>
  ({
    view: FeedViewType.Articles,
    entryId: undefined,
    feedId: undefined,
    isCollection: false,
    isAllFeeds: false,
    isPendingEntry: false,
    folderName: undefined,
    inboxId: undefined,
    listId: undefined,
    timelineId: "articles",
    ...overrides,
  }) as any

const build = (overrides: Record<string, unknown> = {}) => {
  expect(entriesByView).toHaveProperty("buildEntriesByViewQueryProps")
  return (entriesByView as any).buildEntriesByViewQueryProps({
    route: route(),
    folderFeedIds: [],
    activeFeedId: undefined,
    unreadOnly: true,
    hidePrivateSubscriptionsInTimeline: true,
    ...overrides,
  })
}

describe("buildEntriesByViewQueryProps", () => {
  it("maps All and view timelines with normalized exclude-private and unread inputs", () => {
    expect(build({ route: route({ view: FeedViewType.All }) })).toEqual({
      unreadOnly: true,
      hidePrivateSubscriptionsInTimeline: true,
    })
    expect(build()).toEqual({
      view: FeedViewType.Articles,
      unreadOnly: true,
      hidePrivateSubscriptionsInTimeline: true,
    })
  })

  it("maps one feed, many folder feeds, list, inbox, and collection scopes", () => {
    expect(build({ activeFeedId: "f1" })).toMatchObject({ feedId: "f1" })
    expect(build({ folderFeedIds: ["f2", "f1", "f2"] })).toMatchObject({
      feedIdList: ["f1", "f2"],
    })
    expect(build({ route: route({ listId: "l1" }) })).toMatchObject({ listId: "l1" })
    expect(build({ route: route({ inboxId: "i1" }) })).toMatchObject({ inboxId: "i1" })
    expect(build({ route: route({ isCollection: true }) })).toEqual({
      isCollection: true,
      view: FeedViewType.Articles,
      unreadOnly: false,
    })
  })

  it("changes query identity with the route while cursor stays outside the identity", () => {
    expect(entriesByView).toHaveProperty("getEntriesByViewQueryIdentity")
    const getIdentity = (entriesByView as any).getEntriesByViewQueryIdentity

    expect(getIdentity(build({ activeFeedId: "f1" }))).not.toEqual(
      getIdentity(build({ activeFeedId: "f2" })),
    )
    expect(getIdentity({ ...build({ activeFeedId: "f1" }), pageParam: "cursor-a" })).toEqual(
      getIdentity({ ...build({ activeFeedId: "f1" }), pageParam: "cursor-b" }),
    )
  })

  it("keeps a loaded deep-link selection when it is absent from the current page", () => {
    expect(entriesByView).toHaveProperty("includeActiveEntryInQueryPageOrder")
    expect(
      (entriesByView as any).includeActiveEntryInQueryPageOrder({
        pageIds: ["e1", "e2"],
        activeEntryId: "deep-link",
        activeEntryLoaded: true,
      }),
    ).toEqual(["deep-link", "e1", "e2"])
  })

  it("treats a successful empty page as ready", () => {
    expect(entriesByView).toHaveProperty("isEntriesQueryReady")
    expect(
      (entriesByView as any).isEntriesQueryReady({ isSuccess: true, data: { pages: [] } }),
    ).toBe(true)
  })
})

describe("useEntriesByView startup readiness", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient
  let latestResult: ReturnType<typeof entriesByView.useEntriesByView> | undefined

  const Harness = () => {
    latestResult = entriesByView.useEntriesByView({})
    return null
  }

  const DetailHarness = ({ entryId }: { entryId: string }) => {
    usePrefetchEntryDetail(entryId)
    return null
  }

  const render = async (element: ReactNode = createElement(Harness)) => {
    await act(async () => {
      root.render(createElement(QueryClientProvider, { client: queryClient }, element))
    })
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.removeEventListener = vi.fn()
    resetStartupReadinessForTests()
    beginStartupSession("route-test")
    testState.route = route()
    testState.isRemote = false
    testState.unreadOnly = false
    testState.query = {
      data: undefined,
      dataUpdatedAt: 0,
      entriesIds: [],
      error: null,
      fetchNextPage: vi.fn(async () => {}),
      hasNextPage: false,
      isError: false,
      isFetching: false,
      isFetchingNextPage: false,
      isLoading: false,
      isRefetching: false,
      isSuccess: false,
      queryKey: ["entries"],
      refetch: vi.fn(async () => {}),
    }
    testState.queryProps.length = 0
    testState.requests.length = 0
    latestResult = undefined
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
    vi.restoreAllMocks()
  })

  it("does not request the Desktop page until metadata makes the route scope reliable", async () => {
    await render()

    expect(testState.queryProps.at(-1)).toMatchObject({ enabled: false })
    expect(testState.requests).toHaveLength(0)

    await act(async () => markRouteScopeReady())

    expect(testState.queryProps.at(-1)).toMatchObject({ enabled: true })
    expect(testState.requests).toHaveLength(1)
    expect(getStartupReadiness().desktopInitialEntriesReady).toBe(false)
  })

  it.each([
    [20, Array.from({ length: 20 }, (_, index) => ({ id: `e${index}` }))],
    [0, []],
  ])("marks a successful first page with %i rows ready", async (rowCount, rows) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    markRouteScopeReady()
    testState.query = {
      ...testState.query,
      data: { pages: [{ data: rows, page: { hasMore: false, nextCursor: null, limit: 20 } }] },
      entriesIds: rows.map((entry) => entry.id),
      isSuccess: true,
    }

    await render()

    expect(getStartupReadiness().desktopInitialEntriesReady).toBe(true)
    expect(getStartupCountMetricsForTests().get("desktop_startup_entry_rows")).toBe(rowCount)
    expect(info).toHaveBeenCalledWith(
      "[PerformanceMetric]",
      expect.objectContaining({ metric: "desktop_feed_usable_ms", value: expect.any(Number) }),
    )
  })

  it.each(["prefetch-in-flight", "prefetch-complete"] as const)(
    "measures the initial feed commit from route-scope readiness when %s",
    async (prefetchState) => {
      const info = vi.spyOn(console, "info").mockImplementation(() => {})
      let now = 10
      vi.spyOn(performance, "now").mockImplementation(() => now)
      markRouteScopeReady()

      testState.query = {
        ...testState.query,
        isFetching: prefetchState === "prefetch-in-flight",
      }
      if (prefetchState === "prefetch-in-flight") {
        now = 40
        await render()
      }

      now = 110
      testState.query = {
        ...testState.query,
        data: { pages: [{ data: [], page: { hasMore: false, nextCursor: null, limit: 20 } }] },
        isFetching: false,
        isSuccess: true,
      }
      await render()

      expect(info).toHaveBeenCalledWith("[PerformanceMetric]", {
        metric: "desktop_feed_usable_ms",
        value: 100,
      })
    },
  )

  it("starts the same initial query identity again for a new startup session", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    let now = 10
    vi.spyOn(performance, "now").mockImplementation(() => now)
    markRouteScopeReady()

    now = 20
    testState.query = {
      ...testState.query,
      data: { pages: [{ data: [], page: { hasMore: false, nextCursor: null, limit: 20 } }] },
      isSuccess: true,
    }
    await render()

    testState.query = {
      ...testState.query,
      data: undefined,
      isSuccess: false,
    }
    await act(async () => beginStartupSession("route-test-2"))
    now = 100
    await act(async () => markRouteScopeReady())

    now = 160
    testState.query = {
      ...testState.query,
      data: { pages: [{ data: [], page: { hasMore: false, nextCursor: null, limit: 20 } }] },
      isSuccess: true,
    }
    await render()

    expect(
      info.mock.calls
        .filter(
          ([label, payload]) =>
            label === "[PerformanceMetric]" && payload.metric === "desktop_feed_usable_ms",
        )
        .map(([, payload]) => payload.value),
    ).toEqual([10, 60])
  })

  it("starts an unread phase at the query switch without resetting when fetching appears", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    let now = 10
    vi.spyOn(performance, "now").mockImplementation(() => now)
    markRouteScopeReady()

    now = 20
    testState.query = {
      ...testState.query,
      data: { pages: [{ data: [], page: { hasMore: false, nextCursor: null, limit: 20 } }] },
      isSuccess: true,
    }
    await render()

    now = 100
    testState.unreadOnly = true
    testState.query = {
      ...testState.query,
      data: undefined,
      isSuccess: false,
      queryKey: ["entries", { read: false }],
    }
    await render()

    now = 130
    testState.query = {
      ...testState.query,
      isFetching: true,
    }
    await render()

    now = 160
    testState.query = {
      ...testState.query,
      data: { pages: [{ data: [], page: { hasMore: false, nextCursor: null, limit: 20 } }] },
      isFetching: false,
      isSuccess: true,
    }
    await render()

    expect(info).toHaveBeenCalledWith("[PerformanceMetric]", {
      metric: "desktop_unread_usable_ms",
      value: 60,
    })
  })

  it("emits once for each successful query identity", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    markRouteScopeReady()
    testState.query = {
      ...testState.query,
      data: { pages: [{ data: [], page: { hasMore: false, nextCursor: null, limit: 20 } }] },
      isSuccess: true,
    }
    await render()
    await render()

    testState.route = route({ view: FeedViewType.Videos, timelineId: "videos" })
    testState.query = {
      ...testState.query,
      data: undefined,
      isSuccess: false,
      queryKey: ["entries", { scope: { kind: "timeline", view: FeedViewType.Videos } }],
    }
    await render()
    testState.query = {
      ...testState.query,
      data: { pages: [{ data: [], page: { hasMore: false, nextCursor: null, limit: 20 } }] },
      isSuccess: true,
    }
    await render()

    expect(
      info.mock.calls.filter(
        ([label, payload]) =>
          label === "[PerformanceMetric]" && payload.metric === "desktop_feed_usable_ms",
      ),
    ).toHaveLength(2)
  })

  it("keeps page errors visible and does not count them as initial-page readiness", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const error = new Error("page failed")
    markRouteScopeReady()
    testState.query = {
      ...testState.query,
      error,
      isError: true,
    }

    await render()

    expect(latestResult?.error).toBe(error)
    await latestResult?.refetch()
    expect(testState.query.refetch).toHaveBeenCalledTimes(1)
    expect(getStartupReadiness()).toMatchObject({
      desktopInitialEntriesReady: false,
      desktopInitialEntriesTerminalError: true,
    })
    expect(getStartupCountMetricsForTests().has("desktop_startup_entry_rows")).toBe(false)
    expect(getStartupMetricsForTests().has("desktop_initial_entries_ready_ms")).toBe(false)
    expect(info).not.toHaveBeenCalledWith(
      "[PerformanceMetric]",
      expect.objectContaining({ metric: "desktop_feed_usable_ms" }),
    )

    testState.query = {
      ...testState.query,
      data: { pages: [{ data: [], page: { hasMore: false, nextCursor: null, limit: 20 } }] },
      error: null,
      isError: false,
      isSuccess: true,
    }
    await render()

    expect(getStartupReadiness().desktopInitialEntriesReady).toBe(true)
    expect(info).toHaveBeenCalledWith(
      "[PerformanceMetric]",
      expect.objectContaining({ metric: "desktop_feed_usable_ms" }),
    )

    await act(async () => beginStartupSession("route-error-reset"))
    expect(getStartupReadiness()).toMatchObject({
      desktopInitialEntriesReady: false,
      desktopInitialEntriesTerminalError: false,
    })
  })

  it("does not apply the Desktop metadata gate or readiness metric to Remote", async () => {
    testState.isRemote = true
    testState.query = {
      ...testState.query,
      data: { pages: [{ data: [], page: { hasMore: false, nextCursor: null, limit: 20 } }] },
      isSuccess: true,
    }

    await render()

    expect(testState.queryProps.at(-1)).toMatchObject({ enabled: true })
    expect(testState.requests).toHaveLength(1)
    expect(getStartupReadiness().desktopInitialEntriesReady).toBe(false)
  })

  it("fetches deep-link detail even when the ID is absent from the startup page", async () => {
    const fetchDetail = vi.spyOn(entrySyncServices, "fetchEntryDetail").mockResolvedValue(null)

    await render(createElement(DetailHarness, { entryId: "outside-startup-window" }))

    expect(fetchDetail).toHaveBeenCalledWith("outside-startup-window", undefined)
  })
})
