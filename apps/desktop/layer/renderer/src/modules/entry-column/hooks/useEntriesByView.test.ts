import { FeedViewType } from "@suhui/constants"
import { describe, expect, it } from "vitest"

import * as entriesByView from "./useEntriesByView"

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
