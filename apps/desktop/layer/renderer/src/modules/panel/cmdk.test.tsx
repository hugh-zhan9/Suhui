import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"
import Fuse from "fuse.js"
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { appSearchState, commandInputState } = vi.hoisted(() => ({
  appSearchState: { open: false },
  commandInputState: {
    onValueChange: null as null | ((value: string) => Promise<void>),
  },
}))

vi.mock("@suhui/components/icons/empty.jsx", () => ({ EmptyIcon: () => null }))
vi.mock("@suhui/components/icons/logo.jsx", () => ({ Logo: () => null }))
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
  Select: ({ children }: React.PropsWithChildren) => children,
  SelectContent: ({ children }: React.PropsWithChildren) => children,
  SelectItem: ({ children }: React.PropsWithChildren) => children,
  SelectTrigger: ({ children }: React.PropsWithChildren) => children,
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
      Input: React.forwardRef<HTMLInputElement, { onValueChange(value: string): Promise<void> }>(
        function MockInput({ onValueChange }, ref) {
          commandInputState.onValueChange = onValueChange
          return <input ref={ref} />
        },
      ),
      Item: ({ children }: React.PropsWithChildren) => children,
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
vi.mock("~/components/common/LoadMoreIndicator", () => ({ LoadMoreIndicator: () => null }))
vi.mock("~/components/ui/modal/stacked/hooks", () => ({
  useModalStack: () => ({ getTopModalStack: () => null }),
}))
vi.mock("~/hooks/biz/useNavigateEntry", () => ({ useNavigateEntry: () => vi.fn() }))
vi.mock("~/hooks/common", () => ({
  useI18n: () => Object.assign((key: string) => key, { common: (key: string) => key }),
}))
vi.mock("~/modules/feed/feed-icon", () => ({ FeedIcon: () => null }))

import { SearchCmdK } from "./cmdk"
import { searchActions } from "~/store/search"

describe("SearchCmdK local search initialization", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    appSearchState.open = false
    commandInputState.onValueChange = null
    searchActions.reset()

    vi.spyOn(EntryService, "getEntryAll").mockResolvedValue([])
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
    await act(async () => root.render(<SearchCmdK />))

    expect(searchActions.createLocalDbSearch).not.toHaveBeenCalled()
    expect(EntryService.getEntryAll).not.toHaveBeenCalled()
    expect(Fuse.createIndex).not.toHaveBeenCalled()

    appSearchState.open = true
    await act(async () => root.render(<SearchCmdK />))

    expect(searchActions.createLocalDbSearch).toHaveBeenCalledTimes(1)
    expect(EntryService.getEntryAll).toHaveBeenCalledTimes(1)
    expect(Fuse.createIndex).toHaveBeenCalledTimes(3)

    await act(async () => {
      await commandInputState.onValueChange?.("first")
      await commandInputState.onValueChange?.("second")
    })

    expect(searchActions.createLocalDbSearch).toHaveBeenCalledTimes(1)
    expect(EntryService.getEntryAll).toHaveBeenCalledTimes(1)
    expect(Fuse.createIndex).toHaveBeenCalledTimes(3)

    appSearchState.open = false
    await act(async () => root.render(<SearchCmdK />))
    appSearchState.open = true
    await act(async () => root.render(<SearchCmdK />))

    expect(searchActions.createLocalDbSearch).toHaveBeenCalledTimes(2)
    expect(EntryService.getEntryAll).toHaveBeenCalledTimes(2)
    expect(Fuse.createIndex).toHaveBeenCalledTimes(6)
  })
})
