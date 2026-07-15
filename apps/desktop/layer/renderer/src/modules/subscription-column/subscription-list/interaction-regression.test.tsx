import { FeedViewType } from "@suhui/constants"
import React, { act, Profiler, type ProfilerOnRenderCallback } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  OWNER_HOOKS_TEST_SENTINEL,
  observeOwnerRenders,
  setOwnerProjectionMode,
  type OwnerProjectionMode,
  type OwnerRenderKind,
} from "virtual:sidebar-owner-hooks"

const harness = vi.hoisted(() => ({
  categoryOpenState: { Category: true } as Record<string, boolean>,
  changeCategoryOpenState: vi.fn(),
  dndContextProps: null as null | Record<string, any>,
  draggableConfig: null as null | { id: string; disabled: boolean },
  droppableConfig: null as null | Record<string, any>,
  eventHandlers: new Map<string, (data?: any) => void>(),
  feeds: {
    "feed-a": { id: "feed-a", title: "Alpha", type: "feed", url: "https://example.com/a" },
    "feed-b": { id: "feed-b", title: "Beta", type: "feed", url: "https://example.com/b" },
    "feed-c": { id: "feed-c", title: "Charlie", type: "feed", url: "https://example.com/c" },
  } as Record<string, any>,
  feedsData: { Category: ["feed-a", "feed-b", "feed-c"] } as Record<string, string[]>,
  focus: vi.fn(),
  highlightBoundary: vi.fn(),
  mutateSubscriptions: vi.fn(),
  navigate: vi.fn(),
  pendingMenu: null as null | { promise: Promise<void>; resolve: () => void },
  route: { feedId: null, view: 0 } as Record<string, any>,
  selectedFeedIds: [] as string[],
  selectoProps: null as null | Record<string, any>,
  subscriptions: {
    "feed-a": { feedId: "feed-a", category: "Category", view: 0 },
    "feed-b": { feedId: "feed-b", category: "Category", view: 0 },
    "feed-c": { feedId: "feed-c", category: "Category", view: 0 },
  } as Record<string, any>,
  toggleCategoryOpenState: vi.fn(),
  unreadData: {} as Record<string, number>,
}))

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, ...props }: React.PropsWithChildren<Record<string, any>>) => {
    harness.dndContextProps = props
    return children
  },
  PointerSensor: Symbol("PointerSensor"),
  pointerWithin: vi.fn(),
  useDraggable: (config: { id: string; disabled: boolean }) => {
    harness.draggableConfig = config
    return { attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null }
  },
  useDroppable: (config: Record<string, any>) => {
    harness.droppableConfig = config
    return { isOver: false, setNodeRef: vi.fn() }
  },
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}))
vi.mock("@radix-ui/react-slot", () => ({
  Slot: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock("@suhui/components/common/Focusable/hooks.js", () => ({
  useFocusableContainerRef: () => ({ current: document.querySelector("#focus-container") }),
  useFocusActions: () => ({ highlightBoundary: harness.highlightBoundary }),
  useGlobalFocusableScopeSelector: () => true,
}))
vi.mock("@suhui/components/hooks/useMobile.js", () => ({ useMobile: () => false }))
vi.mock("@suhui/components/icons/OouiUserAnonymous.jsx", () => ({ OouiUserAnonymous: () => null }))
vi.mock("@suhui/components/ui/button/index.js", () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<Record<string, any>>) => (
    <button {...props}>{children}</button>
  ),
  MotionButtonBase: ({ children, ...props }: React.PropsWithChildren<Record<string, any>>) => (
    <button {...props}>{children}</button>
  ),
}))
vi.mock("@suhui/components/ui/divider/PanelSplitter.js", () => ({ PanelSplitter: () => null }))
vi.mock("@suhui/components/ui/kbd/Kbd.js", () => ({ Kbd: () => null }))
vi.mock("@suhui/components/ui/loading/index.jsx", () => ({ LoadingCircle: () => null }))
vi.mock("@suhui/components/ui/scroll-area/hooks.js", () => ({ useScrollViewElement: () => null }))
vi.mock("@suhui/components/ui/scroll-area/index.js", async () => {
  const React = await import("react")
  return {
    ScrollArea: {
      ScrollArea: React.forwardRef<HTMLDivElement, React.PropsWithChildren>(function ScrollArea(
        { children },
        ref,
      ) {
        return <div ref={ref}>{children}</div>
      }),
    },
  }
})
vi.mock("@suhui/components/ui/skeleton/index.jsx", () => ({ Skeleton: () => null }))
vi.mock("@suhui/components/ui/tooltip/index.jsx", () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => children,
  TooltipContent: ({ children }: React.PropsWithChildren) => children,
  TooltipPortal: ({ children }: React.PropsWithChildren) => children,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock("@suhui/components/ui/typography/index.js", () => ({
  EllipsisHorizontalTextWithTooltip: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock("@suhui/hooks", () => ({ useRefValue: (value: unknown) => ({ current: value }) }))
vi.mock("@suhui/shared/settings/defaults", () => ({ defaultUISettings: { feedColWidth: 256 } }))
vi.mock("@suhui/store/constants/onboarding", () => ({ isOnboardingFeedUrl: () => false }))
vi.mock("@suhui/store/entry/store", () => ({
  useEntryStore: (selector: (state: any) => unknown) =>
    selector({ data: {}, entryIdByFeed: {}, entryIdByInbox: {} }),
}))
vi.mock("@suhui/store/feed/hooks", () => ({
  useFeedById: (id: string, selector?: (feed: any) => unknown) => {
    const feed = harness.feeds[id]
    return selector && feed ? selector(feed) : feed
  },
}))
vi.mock("@suhui/store/feed/store", () => ({
  useFeedStore: (selector: (state: any) => unknown) => selector({ feeds: harness.feeds }),
}))
vi.mock("@suhui/store/inbox/hooks", () => ({ useInboxById: vi.fn(), useInboxList: () => [] }))
vi.mock("@suhui/store/list/hooks", () => ({ useListById: vi.fn(), useOwnedListByView: () => [] }))
vi.mock("@suhui/store/subscription/hooks", () => ({
  useCategoryOpenStateByView: () => harness.categoryOpenState,
  useFeedsGroupedData: () => harness.feedsData,
  useSidebarSubscriptionSelection: () => ({
    subscriptionIds: Object.values(harness.feedsData).flat(),
    categoryBySubscriptionId: Object.fromEntries(
      Object.entries(harness.feedsData).flatMap(([category, ids]) =>
        ids.map((id) => [id, category]),
      ),
    ),
    explicitCategoryBySubscriptionId: Object.fromEntries(
      Object.values(harness.feedsData)
        .flat()
        .map((id) => [id, harness.subscriptions[id]?.category]),
    ),
    titleOverrideBySubscriptionId: {},
    groups: harness.feedsData,
  }),
  useSubscriptionByFeedId: (id: string) => harness.subscriptions[id],
  useSubscriptionCategoryExist: () => true,
  useSubscriptionListIds: () => [],
}))
vi.mock("@suhui/store/subscription/store", () => ({
  subscriptionActions: {
    changeCategoryOpenState: harness.changeCategoryOpenState,
    toggleCategoryOpenState: harness.toggleCategoryOpenState,
  },
  subscriptionSyncService: { changeCategoryView: vi.fn() },
  useSubscriptionStore: (selector: (state: any) => unknown) =>
    selector({ data: harness.subscriptions }),
}))
vi.mock("@suhui/store/subscription/utils", () => ({
  getDefaultCategory: (subscription: any) => subscription.feedId,
}))
vi.mock("@suhui/store/unread/hooks", () => ({
  useSortedCategoriesByUnread: (data: Record<string, string[]>) => Object.entries(data),
  useSortedIdsByUnread: (ids: string[]) => ids,
}))
vi.mock("@suhui/store/unread/store", () => ({
  unreadSyncService: { markFeedAsRead: vi.fn(), markFeedAsUnread: vi.fn() },
  useUnreadStore: (selector: (state: any) => unknown) => selector({ data: harness.unreadData }),
}))
vi.mock("@suhui/store/unread/utils", () => ({
  getInboxHandleOrFeedIdFromFeedId: (id: string) => id,
}))
vi.mock("@suhui/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }))
vi.mock("@suhui/utils/dom", () => ({
  nextFrame: (callback: () => void) => callback(),
  stopPropagation: (event: Event) => event.stopPropagation(),
}))
vi.mock("@suhui/utils/event-bus", () => ({
  EventBus: {
    subscribe: (event: string, handler: (data?: any) => void) => {
      harness.eventHandlers.set(event, handler)
      return () => harness.eventHandlers.delete(event)
    },
  },
}))
vi.mock("@suhui/utils/utils", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  combineCleanupFunctions:
    (...cleanups: Array<() => void>) =>
    () =>
      cleanups.forEach((cleanup) => cleanup()),
  isKeyForMultiSelectPressed: (event: MouseEvent) =>
    event.ctrlKey || event.metaKey || event.shiftKey,
}))
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock("es-toolkit/compat", () => ({ debounce: (callback: unknown) => callback }))
vi.mock("motion/react", async () => {
  const React = await import("react")
  return {
    AnimatePresence: ({ children }: React.PropsWithChildren) => children,
    m: {
      div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
        function MotionDiv({ children, ...props }, ref) {
          const { animate: _animate, exit: _exit, initial: _initial, ...domProps } = props as any
          return (
            <div ref={ref} {...domProps}>
              {children}
            </div>
          )
        },
      ),
    },
  }
})
vi.mock("react-i18next", () => ({
  Trans: ({ children }: React.PropsWithChildren) => children,
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("react-resizable-layout", () => ({
  useResizable: () => ({
    isDragging: false,
    position: 256,
    separatorCursor: "col-resize",
    separatorProps: {},
    setPosition: vi.fn(),
  }),
}))
vi.mock("react-selecto", () => ({
  default: React.forwardRef(function Selecto(props: Record<string, any>, _ref) {
    harness.selectoProps = props
    return null
  }),
}))
vi.mock("usehooks-ts", () => ({
  useEventCallback: (callback: unknown) => callback,
  useEventListener: vi.fn(),
}))
vi.mock("~/atoms/context-menu", () => ({
  MenuItemSeparator: class MenuItemSeparator {
    static default = new this()
  },
  MenuItemText: class MenuItemText {
    constructor(public input: unknown) {}
  },
  useShowContextMenu: () => vi.fn(() => harness.pendingMenu?.promise ?? Promise.resolve()),
}))
vi.mock("~/atoms/settings/general", () => ({
  useGeneralSettingKey: () => false,
  useGeneralSettingSelector: (selector: (state: any) => unknown) => selector({ autoGroup: false }),
  useHideAllReadSubscriptions: () => false,
}))
vi.mock("~/atoms/settings/ui", () => ({
  getUISettings: () => ({ feedColWidth: 256 }),
  setUISetting: vi.fn(),
  useUISettingKey: () => false,
}))
vi.mock("~/atoms/sidebar", () => ({
  getSubscriptionColumnTempShow: () => false,
  setSubscriptionColumnTempShow: vi.fn(),
  useSubscriptionColumnShow: () => true,
  useSubscriptionColumnTempShow: () => false,
}))
vi.mock("~/components/common/ErrorTooltip", () => ({
  ErrorTooltip: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock("~/components/common/Focusable", () => ({
  FocusablePresets: { isSubscriptionList: () => true },
}))
vi.mock("~/constants", () => ({
  FloatingLayerScope: [],
  ROUTE_FEED_IN_FOLDER: "folder/",
}))
vi.mock("~/hooks/biz/mark-all-toggle", () => ({
  resolveMarkAllToggleAction: () => ({ labelKey: "mark-read", shouldMarkAsRead: true }),
}))
vi.mock("~/hooks/biz/useContextMenuActionShortCutTrigger", () => ({
  useContextMenuActionShortCutTrigger: vi.fn(),
}))
vi.mock("~/hooks/biz/useFeedActions", () => ({
  useAddFeedToFeedList: () => ({ mutate: vi.fn() }),
  useFeedActions: () => [],
  useInboxActions: () => [],
  useListActions: () => [],
}))
vi.mock("~/hooks/biz/useFollow", () => ({ useFollow: () => vi.fn() }))
vi.mock("~/hooks/biz/useNavigateEntry", () => ({ useNavigateEntry: () => harness.navigate }))
vi.mock("~/hooks/biz/useRouteParams", () => ({
  getRouteParams: () => harness.route,
  useRouteParams: () => harness.route,
  useRouteParamsSelector: (selector: (state: any) => unknown) => selector(harness.route),
}))
vi.mock("~/hooks/biz/useSubscriptionActions", () => ({
  useBatchUpdateSubscription: () => ({ mutate: harness.mutateSubscriptions }),
}))
vi.mock("~/hooks/common", () => ({ useI18n: () => (key: string) => key }))
vi.mock("~/hooks/common/useContextMenu", () => ({
  useContextMenu: ({ onContextMenu }: { onContextMenu: (event: Event) => void }) => ({
    onContextMenu,
  }),
}))
vi.mock("~/lib/issues", () => ({ getNewIssueUrl: () => "https://example.com/issue" }))
vi.mock("~/lib/local-views", () => ({ getLocalSupportedViewList: () => [] }))
vi.mock("~/lib/unread-by-source", () => ({
  countUnreadBySourceId: () => 0,
  countUnreadBySourceIds: () => 0,
  sortSourceIdsByUnread: (_state: unknown, ids: string[]) => ids,
}))
vi.mock("~/lib/url-builder", () => ({ UrlBuilder: class UrlBuilder {} }))
vi.mock("~/modules/app/NetworkStatusIndicator", () => ({ NetworkStatusIndicator: () => null }))
vi.mock("~/modules/app-grid-layout-container-provider", () => ({}))
vi.mock("~/modules/feed/feed-icon", () => ({ FeedIcon: () => null }))
vi.mock("~/modules/feed/feed-title", () => ({
  FeedTitle: ({ feed }: { feed: { title: string } }) => <span>{feed.title}</span>,
}))
vi.mock("~/modules/player/corner-player", () => ({ CornerPlayer: () => null }))
vi.mock("~/modules/update-notice/UpdateNotice", () => ({ UpdateNotice: () => null }))
vi.mock("~/providers/app-grid-layout-container-provider", () => ({
  AppLayoutGridContainerProvider: ({ children }: React.PropsWithChildren) => children,
}))
vi.mock("~/queries/feed", () => ({ useFeedQuery: vi.fn() }))
vi.mock("~/store/feed/hooks", () => ({
  getPreferredTitle: (feed?: { title?: string }) => feed?.title ?? "",
}))
vi.mock("../../components/ui/modal/stacked/hooks", () => ({
  useModalStack: () => ({ present: vi.fn() }),
}))
vi.mock("~/components/ui/modal/stacked/hooks", () => ({
  useModalStack: () => ({ present: vi.fn() }),
}))
vi.mock("../../entry-column/hooks/useIsPreviewFeed", () => ({ useIsPreviewFeed: () => false }))
vi.mock("../../settings/tabs/lists/modals", () => ({ ListCreationModalContent: () => null }))
vi.mock("../CategoryRemoveDialogContent", () => ({ CategoryRemoveDialogContent: () => null }))
vi.mock("../CategoryUnsubscribeDialogContent", () => ({
  CategoryUnsubscribeDialogContent: () => null,
}))
vi.mock("../RenameCategoryForm", () => ({ RenameCategoryForm: () => null }))
vi.mock("../atom", () => ({
  getSelectedFeedIds: () => harness.selectedFeedIds,
  resetSelectedFeedIds: () => {
    harness.selectedFeedIds = []
  },
  setFeedAreaScrollProgressValue: vi.fn(),
  setSelectedFeedIds: (next: string[] | ((previous: string[]) => string[])) => {
    harness.selectedFeedIds = typeof next === "function" ? next(harness.selectedFeedIds) : next
  },
  useFeedListSortSelector: (selector: (state: any) => unknown) =>
    selector({ by: "count", order: "desc" }),
  useSelectedFeedIdsState: () => [
    harness.selectedFeedIds,
    (next: string[] | ((previous: string[]) => string[])) => {
      harness.selectedFeedIds = typeof next === "function" ? next(harness.selectedFeedIds) : next
    },
  ],
}))
vi.mock("../hook", () => ({ useShouldFreeUpSpace: () => false }))
vi.mock("./EmptyFeedList", () => ({ EmptyFeedList: () => null }))
vi.mock("./ListHeader", () => ({ ListHeader: () => null }))
vi.mock("./StarredItem", () => ({ StarredItem: () => null }))
vi.mock("../../command/hooks/use-command-binding", () => ({ useCommandBinding: vi.fn() }))
vi.mock("../../command/hooks/use-register-hotkey", () => ({ useCommandHotkey: vi.fn() }))
vi.mock("~/modules/command/hooks/use-command-binding", () => ({ useCommandBinding: vi.fn() }))
vi.mock("~/modules/subscription-column", () => ({
  SubscriptionColumn: ({ children }: React.PropsWithChildren) => children,
}))

import { SubscriptionColumnContainer } from "../../app-layout/subscription-column/SubscriptionColumn"
import { COMMAND_ID } from "../../command/commands/id"
import { SubscriptionList } from "./SubscriptionList"

const createPendingMenu = () => {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe("subscription sidebar interaction regression", () => {
  let container: HTMLDivElement
  let focusContainer: HTMLDivElement
  let renderVersion: number
  let root: Root

  const renderList = async () => {
    await act(async () =>
      root.render(
        <SubscriptionList
          key={renderVersion++}
          view={FeedViewType.All}
          isSubscriptionLoading={false}
        />,
      ),
    )
  }

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    harness.categoryOpenState = { Category: true }
    harness.changeCategoryOpenState.mockReset()
    harness.dndContextProps = null
    harness.draggableConfig = null
    harness.droppableConfig = null
    harness.eventHandlers.clear()
    harness.feeds = {
      "feed-a": { id: "feed-a", title: "Alpha", type: "feed", url: "https://example.com/a" },
      "feed-b": { id: "feed-b", title: "Beta", type: "feed", url: "https://example.com/b" },
      "feed-c": { id: "feed-c", title: "Charlie", type: "feed", url: "https://example.com/c" },
    }
    harness.feedsData = { Category: ["feed-a", "feed-b", "feed-c"] }
    harness.focus.mockReset()
    harness.highlightBoundary.mockReset()
    harness.mutateSubscriptions.mockReset()
    harness.navigate.mockReset()
    harness.pendingMenu = null
    harness.route = { feedId: null, view: FeedViewType.All }
    harness.selectedFeedIds = []
    harness.selectoProps = null
    harness.subscriptions = {
      "feed-a": { feedId: "feed-a", category: "Category", view: FeedViewType.All },
      "feed-b": { feedId: "feed-b", category: "Category", view: FeedViewType.All },
      "feed-c": { feedId: "feed-c", category: "Category", view: FeedViewType.All },
    }
    harness.toggleCategoryOpenState.mockReset()
    harness.unreadData = {}
    renderVersion = 0

    focusContainer = document.createElement("div")
    focusContainer.id = "focus-container"
    focusContainer.tabIndex = -1
    focusContainer.focus = harness.focus
    container = document.createElement("div")
    focusContainer.append(container)
    document.body.append(focusContainer)
    root = createRoot(container)
    await renderList()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    focusContainer.remove()
  })

  it("keeps selection and drag-target guards tied to real feed rows", async () => {
    const selected = container.querySelector('[data-feed-id="feed-a"]')!
    const other = container.querySelector('[data-feed-id="feed-b"]')!
    harness.selectedFeedIds = ["feed-a"]
    await renderList()
    const selecto = harness.selectoProps!

    expect(harness.draggableConfig).toEqual({ id: "selected-feed", disabled: false })
    expect(selecto.selectableTargets).toEqual(["[data-feed-id]"])
    expect(
      selecto.dragCondition({
        inputEvent: { target: selected, ctrlKey: false, metaKey: false, shiftKey: false },
      }),
    ).toBe(false)
    expect(
      selecto.dragCondition({
        inputEvent: { target: selected, ctrlKey: true, metaKey: false, shiftKey: false },
      }),
    ).toBe(true)
    expect(
      selecto.dragCondition({
        inputEvent: { target: other, ctrlKey: false, metaKey: false, shiftKey: false },
      }),
    ).toBe(true)

    selecto.onSelect({ added: [other], removed: [], inputEvent: new MouseEvent("mouseup") })
    expect(harness.selectedFeedIds).toEqual(["feed-a", "feed-b"])

    selecto.onDragStart({ inputEvent: new MouseEvent("mousedown") })
    expect(harness.selectedFeedIds).toEqual([])
  })

  it("wraps last-to-first and first-to-last through the actual category/feed DOM", async () => {
    harness.route = { feedId: "feed-c", view: FeedViewType.All }
    await renderList()
    act(() => harness.eventHandlers.get(COMMAND_ID.subscription.nextSubscription)?.())
    expect(harness.navigate).toHaveBeenLastCalledWith({
      entryId: null,
      folderName: "Category",
      view: FeedViewType.All,
    })

    harness.navigate.mockClear()
    harness.route = { feedId: "folder/Category", view: FeedViewType.All }
    await renderList()
    act(() => harness.eventHandlers.get(COMMAND_ID.subscription.previousSubscription)?.())
    expect(harness.navigate).toHaveBeenLastCalledWith({
      entryId: null,
      feedId: "feed-c",
      view: FeedViewType.All,
    })
  })

  it("restores focus and collapses then re-expands the real category", async () => {
    act(() =>
      harness.eventHandlers.get(COMMAND_ID.layout.focusToSubscription)?.({
        highlightBoundary: true,
      }),
    )
    expect(harness.focus).toHaveBeenCalledTimes(1)
    expect(harness.highlightBoundary).toHaveBeenCalledTimes(1)

    harness.route = { feedId: "folder/Category", view: FeedViewType.All }
    harness.selectedFeedIds = ["feed-a"]
    await renderList()
    expect(container.querySelectorAll("[data-feed-id]")).toHaveLength(3)
    act(() => harness.eventHandlers.get(COMMAND_ID.subscription.toggleFolderCollapse)?.())
    expect(harness.selectedFeedIds).toEqual([])
    expect(harness.toggleCategoryOpenState).toHaveBeenLastCalledWith(FeedViewType.All, "Category")

    harness.categoryOpenState = { Category: false }
    await renderList()
    expect(container.querySelectorAll("[data-feed-id]")).toHaveLength(0)
    expect(container.querySelector('[data-type="collapse"]')?.getAttribute("data-state")).toBe(
      "close",
    )
    ;(container.querySelector('[data-type="collapse"]') as HTMLElement).click()
    harness.categoryOpenState = { Category: true }
    await renderList()
    expect(container.querySelectorAll("[data-feed-id]")).toHaveLength(3)
    expect(container.querySelector('[data-type="collapse"]')?.getAttribute("data-state")).toBe(
      "open",
    )
  })

  it("propagates grouped subscription add, edit, and delete through real category/feed owners", async () => {
    expect(container.querySelectorAll("[data-feed-id]")).toHaveLength(3)
    expect(container.querySelector('[data-sub="feed-category-Category"]')).not.toBeNull()

    harness.feeds["feed-new"] = {
      id: "feed-new",
      title: "New Feed",
      type: "feed",
      url: "https://example.com/new",
    }
    harness.subscriptions["feed-a"] = {
      feedId: "feed-a",
      category: "Renamed",
      view: FeedViewType.All,
    }
    harness.subscriptions["feed-new"] = {
      feedId: "feed-new",
      category: "Renamed",
      view: FeedViewType.All,
    }
    harness.feedsData = { Renamed: ["feed-a", "feed-new"] }
    harness.categoryOpenState = { Renamed: true }
    await renderList()

    expect(container.querySelector('[data-sub="feed-category-Category"]')).toBeNull()
    expect(container.querySelector('[data-sub="feed-category-Renamed"]')).not.toBeNull()
    expect(container.querySelector('[data-feed-id="feed-new"]')).not.toBeNull()
    expect(container.querySelector('[data-feed-id="feed-b"]')).toBeNull()
  })

  it("holds and resets real feed context-menu active state", async () => {
    const feed = container.querySelector('[data-feed-id="feed-a"]') as HTMLElement
    harness.pendingMenu = createPendingMenu()

    await act(async () => feed.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })))
    expect(feed.dataset.active).toBe("true")

    await act(async () => harness.pendingMenu?.resolve())
    expect(feed.dataset.active).toBe("false")
  })

  it("registers the real category droppable and dispatches its drop payload", async () => {
    expect(harness.droppableConfig).toEqual({
      id: "category-Category",
      disabled: false,
      data: { category: "Category", view: FeedViewType.All },
    })

    harness.selectedFeedIds = ["feed-a", "feed-b"]
    await act(async () => root.render(<SubscriptionColumnContainer />))
    act(() =>
      harness.dndContextProps?.onDragEnd({
        over: { data: { current: { category: "Category", view: FeedViewType.All } } },
      }),
    )

    expect(harness.mutateSubscriptions).toHaveBeenCalledWith({
      category: "Category",
      view: FeedViewType.All,
      feedIdList: ["feed-a", "feed-b"],
    })
    expect(harness.selectedFeedIds).toEqual([])
  })

  it.each([400, 800])(
    "profiles the real production owner chain for %i subscriptions",
    async (count) => {
      const runProfile = async (mode: OwnerProjectionMode) => {
        expect(OWNER_HOOKS_TEST_SENTINEL).toBe("suhui-sidebar-owner-profile-test-only")
        await act(async () => root.unmount())
        container.replaceChildren()

        const feedIds = Array.from({ length: count }, (_, index) => `feed-${index}`)
        harness.feeds = Object.fromEntries(
          feedIds.map((feedId) => [
            feedId,
            {
              id: feedId,
              title: `Title ${feedId}`,
              type: "feed",
              url: `https://example.com/${feedId}`,
            },
          ]),
        )
        harness.feedsData = Object.fromEntries(
          Array.from({ length: count / 10 }, (_, categoryIndex) => [
            `category-${categoryIndex}`,
            feedIds.slice(categoryIndex * 10, categoryIndex * 10 + 10),
          ]),
        )
        harness.subscriptions = Object.fromEntries(
          feedIds.map((feedId, index) => [
            feedId,
            {
              feedId,
              category: `category-${Math.floor(index / 10)}`,
              view: FeedViewType.All,
            },
          ]),
        )
        harness.categoryOpenState = Object.fromEntries(
          Array.from({ length: count / 10 }, (_, index) => [`category-${index}`, true]),
        )
        harness.unreadData = Object.fromEntries(feedIds.map((feedId) => [feedId, 1]))

        root = createRoot(container)
        const durations: number[] = []
        let renders = { category: 0, row: 0 }
        const stopObserving = observeOwnerRenders((kind: OwnerRenderKind) => {
          renders[kind]++
        })
        const resetProjectionMode = setOwnerProjectionMode(mode)
        const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
          durations.push(actualDuration)
        }
        const renderProfile = async (className: string) => {
          await act(async () => {
            root.render(
              <Profiler id={`sidebar-${mode}`} onRender={onRender}>
                <SubscriptionList
                  className={className}
                  view={FeedViewType.All}
                  isSubscriptionLoading={false}
                />
              </Profiler>,
            )
          })
          const result = {
            categoryRenders: renders.category,
            rowRenders: renders.row,
            durationMs: durations.at(-1) ?? 0,
            domNodes: container.querySelectorAll("*").length,
            categoryNodes: container.querySelectorAll('[data-sub^="feed-category-"]').length,
            rowNodes: container.querySelectorAll("[data-feed-id]").length,
          }
          renders = { category: 0, row: 0 }
          return result
        }

        try {
          const initial = await renderProfile("profile-initial")
          const unrelatedUpdate = await renderProfile("profile-unrelated")
          harness.unreadData = { ...harness.unreadData, "feed-0": 100 }
          const selectedUpdate = await renderProfile("profile-selected")
          return { initial, unrelatedUpdate, selectedUpdate }
        } finally {
          stopObserving()
          resetProjectionMode()
        }
      }

      const before = await runProfile("rebuild-all")
      const final = await runProfile("production")

      console.info(
        "SIDEBAR_REAL_OWNER_PROFILE",
        JSON.stringify({
          count,
          environment: "Vitest + React Profiler + Happy DOM; comparative, not production P95",
          ownerChain:
            "SubscriptionList -> SortableFeedList -> FeedCategory -> SortedFeedItems -> FeedItem",
          before,
          final,
        }),
      )

      expect(before.initial).toMatchObject({
        categoryRenders: count / 10,
        rowRenders: count,
        categoryNodes: count / 10,
        rowNodes: count,
      })
      expect(before.unrelatedUpdate.categoryRenders).toBe(count / 10)
      expect(final.initial).toMatchObject({
        categoryRenders: count / 10,
        rowRenders: count,
        categoryNodes: count / 10,
        rowNodes: count,
      })
      expect(final.unrelatedUpdate.categoryRenders).toBe(0)
      expect(final.unrelatedUpdate.rowRenders).toBe(0)
      expect(final.selectedUpdate.categoryRenders).toBe(1)
      expect(final.selectedUpdate.rowRenders).toBe(0)
      expect(final.initial.domNodes).toBeGreaterThan(count)
      expect(final.selectedUpdate.domNodes).toBe(final.initial.domNodes)
    },
    30_000,
  )
})
