import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"
import Fuse from "fuse.js"
import { Provider } from "jotai"
import { jotaiStore } from "~/lib/jotai"
import type * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setAppSearchOpen } from "~/atoms/app"
import { searchActions, useSearchStore } from "~/store/search"

import { SearchCmdK } from "./cmdk"
import { SearchType } from "~/store/search/constants"

const { appSearchState, commandInputState, navigateEntry } = vi.hoisted(() => ({
  appSearchState: { open: false },
  navigateEntry: vi.fn(),
  commandInputState: {
    onValueChange: null as null | ((value: string) => Promise<void>),
  },
}))

vi.mock("@suhui/components/icons/empty.jsx", () => ({ EmptyIcon: () => null }))
vi.mock("@suhui/components/ui/scroll-area/index.js", async () => {
  const React = await import("react")
  return {
    ScrollArea: {
      ScrollArea: React.forwardRef<HTMLDivElement, React.PropsWithChildren>(function MockScrollArea(
        { children },
        ref,
      ) {
        return <div ref={ref}>{children}</div>
      }),
    },
  }
})
vi.mock("@suhui/components/ui/select/index.jsx", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: React.PropsWithChildren<{ value: string; onValueChange: (value: string) => void }>) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: React.PropsWithChildren) => children,
  SelectItem: ({ children, value }: React.PropsWithChildren<{ value: string }>) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}))
vi.mock("@suhui/components/ui/tooltip/index.jsx", () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => children,
  TooltipContent: ({ children }: React.PropsWithChildren) => children,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock("@suhui/hooks", () => ({
  useInputComposition: () => ({
    isCompositionRef: { current: false },
    onCompositionEnd: vi.fn(),
    onCompositionStart: vi.fn(),
  }),
}))
vi.mock("@suhui/store/feed/getter", () => ({ getFeedById: () => null }))
vi.mock("@suhui/store/subscription/getter", () => ({
  getSubscriptionByFeedId: () => null,
}))
vi.mock("@suhui/store/unread/getters", () => ({ getUnreadById: () => 0 }))
vi.mock("@suhui/tracker", () => ({ tracker: { searchOpen: vi.fn() } }))
vi.mock("@suhui/utils/utils", () => ({
  clsx: (...values: unknown[]) => values.filter(Boolean).join(" "),
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}))
vi.mock("cmdk", async () => {
  const React = await import("react")
  return {
    Command: {
      Dialog: React.forwardRef<HTMLDivElement, React.PropsWithChildren>(function MockDialog(
        { children },
        ref,
      ) {
        return <div ref={ref}>{children}</div>
      }),
      Empty: ({ children }: React.PropsWithChildren) => children,
      Group: ({ children }: React.PropsWithChildren) => children,
      Input: React.forwardRef<
        HTMLInputElement,
        { onValueChange: (value: string) => Promise<void> }
      >(function MockInput({ onValueChange }, ref) {
        commandInputState.onValueChange = onValueChange
        return <input ref={ref} />
      }),
      Item: ({ children, onSelect }: React.PropsWithChildren<{ onSelect: () => void }>) => (
        <button type="button" data-search-result onClick={onSelect}>
          {children}
        </button>
      ),
      List: ({ children }: React.PropsWithChildren) => children,
    },
  }
})
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("~/atoms/app", () => ({
  setAppSearchOpen: vi.fn(),
  useAppSearchOpen: () => appSearchState.open,
}))
vi.mock("~/components/common/ExPromise", () => ({ ExPromise: () => null }))
vi.mock("~/components/common/LoadMoreIndicator", () => ({
  LoadMoreIndicator: ({ onLoading }: { onLoading: () => void }) => (
    <button type="button" data-load-more onClick={onLoading}>
      More
    </button>
  ),
}))
vi.mock("~/components/ui/modal/stacked/hooks", () => ({
  useModalStack: () => ({ getTopModalStack: () => null }),
}))
vi.mock("~/hooks/biz/useNavigateEntry", () => ({ useNavigateEntry: () => navigateEntry }))
vi.mock("~/hooks/common", () => ({
  useI18n: () => Object.assign((key: string) => key, { common: (key: string) => key }),
}))
vi.mock("~/modules/feed/feed-icon", () => ({ FeedIcon: () => null }))

describe("SearchCmdK local search initialization", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    appSearchState.open = false
    commandInputState.onValueChange = null
    searchActions.reset()
    searchActions.setSearchType(SearchType.Feed)
    searchActions.setSearchScope("all")
    vi.clearAllMocks()

    vi.spyOn(EntryService, "getEntryAll").mockResolvedValue([])
    vi.spyOn(EntryService, "getSearchCount").mockResolvedValue(0)
    vi.spyOn(FeedService, "getFeedAll").mockResolvedValue([])
    vi.spyOn(SubscriptionService, "getSubscriptionAll").mockResolvedValue([])
    vi.spyOn(Fuse, "createIndex")
    vi.spyOn(searchActions, "createLocalDbSearch")

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it("does not index on mount and reuses the first open search instance for repeated queries", async () => {
    await act(async () =>
      root.render(
        <Provider store={jotaiStore}>
          <SearchCmdK />
        </Provider>,
      ),
    )

    expect(searchActions.createLocalDbSearch).not.toHaveBeenCalled()
    expect(EntryService.getEntryAll).not.toHaveBeenCalled()
    expect(Fuse.createIndex).not.toHaveBeenCalled()

    appSearchState.open = true
    await act(async () =>
      root.render(
        <Provider store={jotaiStore}>
          <SearchCmdK />
        </Provider>,
      ),
    )

    expect(searchActions.createLocalDbSearch).toHaveBeenCalledTimes(1)
    expect(EntryService.getEntryAll).not.toHaveBeenCalled()
    expect(Fuse.createIndex).toHaveBeenCalledTimes(2)

    await act(async () => {
      await commandInputState.onValueChange?.("first")
      await commandInputState.onValueChange?.("second")
    })

    expect(searchActions.createLocalDbSearch).toHaveBeenCalledTimes(1)
    expect(EntryService.getEntryAll).not.toHaveBeenCalled()
    expect(Fuse.createIndex).toHaveBeenCalledTimes(2)

    appSearchState.open = false
    await act(async () =>
      root.render(
        <Provider store={jotaiStore}>
          <SearchCmdK />
        </Provider>,
      ),
    )
    appSearchState.open = true
    await act(async () =>
      root.render(
        <Provider store={jotaiStore}>
          <SearchCmdK />
        </Provider>,
      ),
    )

    expect(searchActions.createLocalDbSearch).toHaveBeenCalledTimes(2)
    expect(EntryService.getEntryAll).not.toHaveBeenCalled()
    expect(Fuse.createIndex).toHaveBeenCalledTimes(4)
  })

  it("loads a partial second page, closes on selection and clears stale results on reopen", async () => {
    appSearchState.open = true
    await act(async () =>
      root.render(
        <Provider store={jotaiStore}>
          <SearchCmdK />
        </Provider>,
      ),
    )
    await act(async () => {
      useSearchStore.setState({
        keyword: "article",
        entries: Array.from({ length: 17 }, (_, index) => ({
          item: { id: `entry-${index}`, title: "Lynan&#39;s Page", feedId: "feed-1" },
          feedId: "feed-1",
        })),
      })
    })
    expect(container.querySelectorAll("[data-search-result]")).toHaveLength(16)
    expect(container.textContent).toContain("Lynan's Page")
    await act(async () => container.querySelector<HTMLButtonElement>("[data-load-more]")!.click())
    expect(container.querySelectorAll("[data-search-result]")).toHaveLength(17)
    expect(container.querySelector("[data-load-more]")).toBeNull()
    await act(async () =>
      container.querySelector<HTMLButtonElement>("[data-search-result]")!.click(),
    )
    expect(setAppSearchOpen).toHaveBeenCalledWith(false)
    expect(navigateEntry).toHaveBeenCalledWith({
      feedId: "feed-1",
      entryId: "entry-0",
      view: undefined,
    })

    appSearchState.open = false
    await act(async () =>
      root.render(
        <Provider store={jotaiStore}>
          <SearchCmdK />
        </Provider>,
      ),
    )
    appSearchState.open = true
    await act(async () =>
      root.render(
        <Provider store={jotaiStore}>
          <SearchCmdK />
        </Provider>,
      ),
    )
    expect(container.querySelectorAll("[data-search-result]")).toHaveLength(0)
    expect(searchActions.getCurrentKeyword()).toBe("")
  })
  it("renders title and context matches as safe text and reruns the query when scope changes", async () => {
    const search = vi.fn(async () => useSearchStore.getState())
    vi.mocked(searchActions.createLocalDbSearch).mockResolvedValue({
      search,
      dispose: vi.fn(),
      counts: { entries: 1, feeds: 1, subscriptions: 1 },
    })
    appSearchState.open = true
    await act(async () =>
      root.render(
        <Provider store={jotaiStore}>
          <SearchCmdK />
        </Provider>,
      ),
    )
    await act(async () => {
      searchActions.setSearchType(SearchType.Entry)
      useSearchStore.setState({
        keyword: "Cursor",
        entries: [
          {
            feedId: "feed-1",
            item: {
              id: "e1",
              feedId: "feed-1",
              title: "Cursor &amp; AI",
              titleMatches: [[0, 6]],
              snippet: {
                field: "content",
                text: "Before Cursor <img src=x> after",
                matches: [[7, 13]],
              },
            },
          },
        ],
      })
    })
    expect([...container.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual([
      "Cursor",
      "Cursor",
    ])
    expect(container.querySelector("[data-search-snippet]")?.textContent).toContain(
      "正文：Before Cursor <img src=x> after",
    )
    expect(container.querySelector("img")).toBeNull()
    const scope = [...container.querySelectorAll("select")].find((select) =>
      select.querySelector('option[value="title"]'),
    )!
    await act(async () => {
      scope.value = "title"
      scope.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(search).toHaveBeenCalledWith("Cursor")
    expect(scope.value).toBe("title")
  })
})
