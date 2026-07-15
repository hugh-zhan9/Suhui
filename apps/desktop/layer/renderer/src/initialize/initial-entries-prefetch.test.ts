import { FeedViewType } from "@suhui/constants"
import { getEntriesInfiniteQueryOptions } from "@suhui/store/entry/hooks"
import { entrySyncServices } from "@suhui/store/entry/store"
import { QueryClient } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ROUTE_ENTRY_PENDING, ROUTE_FEED_PENDING } from "../constants"

import {
  deriveDesktopInitialEntriesQueryProps,
  prefetchDesktopInitialEntries,
} from "./initial-entries-prefetch"

const route = (overrides: Record<string, unknown> = {}) =>
  ({
    view: FeedViewType.Articles,
    entryId: ROUTE_ENTRY_PENDING,
    feedId: ROUTE_FEED_PENDING,
    isCollection: false,
    isAllFeeds: true,
    isPendingEntry: true,
    folderName: undefined,
    inboxId: undefined,
    listId: undefined,
    timelineId: "articles",
    ...overrides,
  }) as any

afterEach(() => vi.restoreAllMocks())

describe("deriveDesktopInitialEntriesQueryProps", () => {
  it("derives the exact pending timeline query from hydrated settings", () => {
    expect(
      deriveDesktopInitialEntriesQueryProps({
        route: route(),
        settings: {
          unreadOnly: true,
          hidePrivateSubscriptionsInTimeline: true,
        },
      }),
    ).toEqual({
      view: FeedViewType.Articles,
      unreadOnly: true,
      hidePrivateSubscriptionsInTimeline: true,
    })
  })

  it.each([
    ["feed", { feedId: "feed-1", isAllFeeds: false }],
    ["entry deep link", { entryId: "entry-1", isPendingEntry: false }],
    ["list", { listId: "list-1" }],
    ["inbox", { inboxId: "inbox-1" }],
    ["folder", { folderName: "folder-1" }],
    ["collection", { isCollection: true }],
    ["unresolved timeline", { timelineId: undefined }],
  ])("skips an ambiguous or non-startup %s route", (_label, overrides) => {
    expect(
      deriveDesktopInitialEntriesQueryProps({
        route: route(overrides),
        settings: {
          unreadOnly: false,
          hidePrivateSubscriptionsInTimeline: false,
        },
      }),
    ).toBeUndefined()
  })
})

describe("prefetchDesktopInitialEntries", () => {
  it("uses the shared infinite-query key and fetch behavior", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const fetchEntries = vi.spyOn(entrySyncServices, "fetchEntries").mockResolvedValue({
      data: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })
    const props = {
      view: FeedViewType.Articles,
      unreadOnly: false,
      hidePrivateSubscriptionsInTimeline: true,
    }

    await prefetchDesktopInitialEntries({
      client,
      route: route(),
      settings: {
        unreadOnly: false,
        hidePrivateSubscriptionsInTimeline: true,
      },
    })

    const sharedOptions = getEntriesInfiniteQueryOptions(props, {
      feedUnreadDirty: false,
      isPop: false,
    })
    expect(client.getQueryData(sharedOptions.queryKey)).toMatchObject({ pages: [{ data: [] }] })
    expect(fetchEntries).toHaveBeenCalledTimes(1)
    client.clear()
  })

  it("does not start a request for a deep link", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const fetchEntries = vi.spyOn(entrySyncServices, "fetchEntries")

    await prefetchDesktopInitialEntries({
      client,
      route: route({ entryId: "entry-1", isPendingEntry: false }),
      settings: {
        unreadOnly: false,
        hidePrivateSubscriptionsInTimeline: false,
      },
    })

    expect(fetchEntries).not.toHaveBeenCalled()
    client.clear()
  })
})
