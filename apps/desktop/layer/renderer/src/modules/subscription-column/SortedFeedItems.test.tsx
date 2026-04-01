import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { useFeedListSortSelectorMock, useSortedIdsByUnreadMock, useFeedStoreMock } = vi.hoisted(
  () => ({
    useFeedListSortSelectorMock: vi.fn(),
    useSortedIdsByUnreadMock: vi.fn(),
    useFeedStoreMock: vi.fn(),
  }),
)

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
  getPreferredTitle: () => "",
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
})
