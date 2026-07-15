/* @vitest-environment happy-dom */

import { FeedViewType } from "@suhui/constants"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../feed/hooks", () => ({
  useFeedUnreadIsDirty: () => false,
}))

vi.mock("../unread/hooks", () => ({
  useSyncUnreadWhenUnMatch: () => undefined,
}))

import { getEntriesInfiniteQueryOptions, useEntriesQuery } from "./hooks"
import { entrySyncServices } from "./store"

describe("useEntriesQuery render prefetch", () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: Root
  let renderingHarness = false
  let latestQuery: ReturnType<typeof useEntriesQuery> | undefined

  const Harness = ({ enabled = true }: { enabled?: boolean }) => {
    renderingHarness = true
    latestQuery = useEntriesQuery({
      enabled,
      view: FeedViewType.Articles,
    })
    renderingHarness = false
    return null
  }

  const render = async (enabled = true) => {
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(Harness, { enabled }),
        ),
      )
    })
  }

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
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

  it("starts the initial entries request while the component is rendering", async () => {
    const startedDuringRender: boolean[] = []
    vi.spyOn(entrySyncServices, "fetchEntries").mockImplementation(async () => {
      startedDuringRender.push(renderingHarness)
      return {
        data: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      }
    })

    await render()

    expect(startedDuringRender).toEqual([true])
  })

  it("does not prefetch while the route gate is disabled", async () => {
    const fetchEntries = vi.spyOn(entrySyncServices, "fetchEntries").mockResolvedValue({
      data: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })

    await render(false)

    expect(fetchEntries).not.toHaveBeenCalled()
  })

  it("preserves opaque cursor pagination", async () => {
    const fetchEntries = vi
      .spyOn(entrySyncServices, "fetchEntries")
      .mockResolvedValueOnce({
        data: [],
        page: { limit: 20, hasMore: true, nextCursor: "next-page" },
      })
      .mockResolvedValueOnce({
        data: [],
        page: { limit: 20, hasMore: false, nextCursor: null },
      })

    await render()
    await act(async () => {
      await latestQuery?.fetchNextPage()
    })

    expect(fetchEntries).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        pageParam: "next-page",
      }),
    )
  })

  it("reuses the imperative infinite-query options and deduplicates an in-flight request", async () => {
    let resolveRequest!: (value: {
      data: never[]
      page: { limit: number; hasMore: false; nextCursor: null }
    }) => void
    const request = new Promise<{
      data: never[]
      page: { limit: number; hasMore: false; nextCursor: null }
    }>((resolve) => {
      resolveRequest = resolve
    })
    const fetchEntries = vi.spyOn(entrySyncServices, "fetchEntries").mockReturnValue(request)
    const props = { view: FeedViewType.Articles }

    const prefetchPromise = queryClient.prefetchInfiniteQuery(
      getEntriesInfiniteQueryOptions(props, { feedUnreadDirty: false, isPop: false }),
    )
    await render()

    expect(fetchEntries).toHaveBeenCalledTimes(1)
    expect(fetchEntries).toHaveBeenCalledWith(
      expect.objectContaining({ view: FeedViewType.Articles, pageParam: undefined }),
    )

    resolveRequest({
      data: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })
    await act(async () => prefetchPromise)
  })
})
