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
import { getStartupCountMetricsForTests } from "~/initialize/startup-metrics"

const testState = vi.hoisted(() => ({
  route: null as any,
  isRemote: false,
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
    key === "unreadOnly" || key === "hidePrivateSubscriptionsInTimeline" ? false : undefined,
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
  })

  it("keeps page errors visible and does not count them as initial-page readiness", async () => {
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
    expect(getStartupReadiness().desktopInitialEntriesReady).toBe(false)
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
