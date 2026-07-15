import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getPreferredTitleMock,
  useFeedListSortSelectorMock,
  useSortedIdsByUnreadMock,
  useFeedStoreMock,
} = vi.hoisted(() => ({
  getPreferredTitleMock: vi.fn((feed?: { title?: string }) => feed?.title ?? ""),
  useFeedListSortSelectorMock: vi.fn(),
  useSortedIdsByUnreadMock: vi.fn(),
  useFeedStoreMock: vi.fn(),
}))

vi.mock("@suhui/store/unread/hooks", () => ({
  useSortedIdsByUnread: useSortedIdsByUnreadMock,
}))

vi.mock("@suhui/store/feed/store", () => ({
  useFeedStore: useFeedStoreMock,
}))

vi.mock("./atom", () => ({
  useFeedListSortSelector: useFeedListSortSelectorMock,
}))

vi.mock("./FeedItem", () => ({
  FeedItemAutoHideUnread: ({ feedId }: { feedId: string }) => (
    <div data-testid="feed">{feedId}</div>
  ),
}))

vi.mock("~/store/feed/hooks", () => ({
  getPreferredTitle: getPreferredTitleMock,
}))

import { SortedFeedItems } from "./SortedFeedItems"

describe("SortedFeedItems", () => {
  beforeEach(() => {
    useFeedListSortSelectorMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({ by: "count", order: "desc" }),
    )
    useSortedIdsByUnreadMock.mockReturnValue(["normal-high", "onboarding-low"])
    useFeedStoreMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        feeds: {
          "normal-high": { id: "normal-high", url: "https://example.com/feed" },
          "onboarding-low": { id: "onboarding-low", url: "https://app.follow.is/welcome" },
        },
      }),
    )
  })

  it("按未读排序时应保持未读顺序，不能把 onboarding feed 强行提前", () => {
    const html = renderToStaticMarkup(
      <SortedFeedItems
        ids={["normal-high", "onboarding-low"]}
        view={0 as any}
        showCollapse={false}
      />,
    )

    expect(html.indexOf("normal-high")).toBeLessThan(html.indexOf("onboarding-low"))
  })

  it.each([400, 800])("preserves the unread selector order for %i subscriptions", (count) => {
    const ids = Array.from({ length: count }, (_, index) => `feed-${index}`)
    const unreadOrder = ids.concat().reverse()
    useSortedIdsByUnreadMock.mockReturnValue(unreadOrder)
    useFeedStoreMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        feeds: Object.fromEntries(
          ids.map((id) => [id, { id, title: id, url: `https://example.com/${id}` }]),
        ),
      }),
    )

    const html = renderToStaticMarkup(
      <SortedFeedItems ids={ids} view={0 as any} showCollapse={false} />,
    )
    const rendered = Array.from(html.matchAll(/data-testid="feed">([^<]+)/g), (match) => match[1])

    expect(rendered).toEqual(unreadOrder)
  })

  it.each([
    ["desc", ["feed-a", "feed-b", "feed-c"]],
    ["asc", ["feed-c", "feed-b", "feed-a"]],
  ] as const)("keeps the current alphabetical %s direction", (order, expected) => {
    const ids = ["feed-c", "feed-a", "feed-b"]
    useFeedListSortSelectorMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({ by: "alphabetical", order }),
    )
    useFeedStoreMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        feeds: {
          "feed-a": { id: "feed-a", title: "Alpha", url: "https://example.com/a" },
          "feed-b": { id: "feed-b", title: "Beta", url: "https://example.com/b" },
          "feed-c": { id: "feed-c", title: "Charlie", url: "https://example.com/c" },
        },
      }),
    )

    const html = renderToStaticMarkup(<SortedFeedItems ids={ids} view={0 as any} showCollapse />)
    const rendered = Array.from(html.matchAll(/data-testid="feed">([^<]+)/g), (match) => match[1])

    expect(rendered).toEqual(expected)
  })

  it.each([
    ["desc", ["feed-a", "feed-c", "feed-b"]],
    ["asc", ["feed-b", "feed-c", "feed-a"]],
  ] as const)("keeps duplicate feed-title tie behavior in %s order", (order, expected) => {
    const ids = ["feed-a", "feed-b", "feed-c"]
    useFeedListSortSelectorMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({ by: "alphabetical", order }),
    )
    useFeedStoreMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        feeds: {
          "feed-a": { id: "feed-a", title: "Duplicate", url: "https://example.com/a" },
          "feed-b": { id: "feed-b", title: "Zulu", url: "https://example.com/b" },
          "feed-c": { id: "feed-c", title: "Duplicate", url: "https://example.com/c" },
        },
      }),
    )

    const html = renderToStaticMarkup(<SortedFeedItems ids={ids} view={0 as any} showCollapse />)
    const rendered = Array.from(html.matchAll(/data-testid="feed">([^<]+)/g), (match) => match[1])

    expect(rendered).toEqual(expected)
  })
})
