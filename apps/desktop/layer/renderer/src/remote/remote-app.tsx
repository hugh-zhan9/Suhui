/**
 * 远程端应用
 * 复用桌面端的 store hooks 和样式系统
 */

import { FeedViewType, getViewList } from "@suhui/constants"
import { cn } from "@suhui/utils/utils"
import { useEffect, useMemo, useRef, useState } from "react"
import { useMobile } from "@suhui/components/hooks/useMobile.js"

import { useEntry, useEntriesQuery } from "@suhui/store/entry/hooks"
import { useFeedById } from "@suhui/store/feed/hooks"
import { useSubscriptionStore } from "@suhui/store/subscription/store"
import { useUnreadStore } from "@suhui/store/unread/store"
import { entrySyncServices } from "@suhui/store/entry/store"
import { unreadSyncService } from "@suhui/store/unread/store"
import { remoteSSEHandler } from "@suhui/store/remote/sse-handler"

// ============ 远程端应用 ============

export function RemoteApp() {
  const isMobile = useMobile()
  const [activeView, setActiveView] = useState<FeedViewType>(FeedViewType.All)
  const [activeFeedId, setActiveFeedId] = useState<string | null>(null)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [connected, setConnected] = useState(true)
  const [mobilePane, setMobilePane] = useState<"feeds" | "entries" | "content">("entries")

  // 获取订阅数据
  const subscriptionState = useSubscriptionStore()
  const unreadState = useUnreadStore()

  const getFeedIdsForView = useMemo(() => {
    return (view: FeedViewType) => {
      const indexedFeedIds = Array.from(subscriptionState.feedIdByView[view] || [])
      if (indexedFeedIds.length > 0) {
        return indexedFeedIds
      }

      return Object.values(subscriptionState.data)
        .filter((subscription) => {
          if (subscription.type !== "feed" || !subscription.feedId) return false
          return view === FeedViewType.All || subscription.view === view
        })
        .map((subscription) => subscription.feedId!)
    }
  }, [subscriptionState.data, subscriptionState.feedIdByView])

  const availableViews = useMemo(
    () =>
      getViewList({ includeAll: true }).filter((view) => getFeedIdsForView(view.view).length > 0),
    [getFeedIdsForView],
  )

  // 从订阅 store 中提取 feed 列表
  const feedList = useMemo(() => {
    const feeds: Array<{
      feedId: string
      title: string | null
      category: string | null
    }> = []

    const { data } = subscriptionState
    const feedIds = getFeedIdsForView(activeView)

    for (const feedId of feedIds) {
      const subscription = data[feedId]
      if (subscription) {
        feeds.push({
          feedId,
          title: subscription.title ?? null,
          category: subscription.category ?? null,
        })
      }
    }

    return feeds
  }, [activeView, getFeedIdsForView, subscriptionState.data])

  // 设置 SSE 连接状态监听
  useEffect(() => {
    remoteSSEHandler.setHandlers({
      onConnectionChange: (isConnected) => {
        setConnected(isConnected)
      },
    })
  }, [])

  useEffect(() => {
    if (availableViews.some((view) => view.view === activeView)) return
    setActiveView(availableViews[0]?.view ?? FeedViewType.All)
  }, [activeView, availableViews])

  const activeFeedIdsForView = useMemo(
    () => getFeedIdsForView(activeView),
    [activeView, getFeedIdsForView],
  )

  // 设置默认活跃 feed
  useEffect(() => {
    if (isMobile) return
    if (!activeFeedId && feedList.length > 0 && feedList[0]) {
      setActiveFeedId(feedList[0].feedId)
    }
  }, [feedList, activeFeedId, isMobile])

  useEffect(() => {
    if (activeFeedId && !feedList.some((feed) => feed.feedId === activeFeedId)) {
      setActiveFeedId(isMobile ? null : (feedList[0]?.feedId ?? null))
      setActiveEntryId(null)
    }
  }, [activeFeedId, feedList, isMobile])

  useEffect(() => {
    if (!isMobile) return
    if (mobilePane === "content" && !activeEntryId) {
      setMobilePane("entries")
    }
  }, [activeEntryId, isMobile, mobilePane])

  const activeFeedTitle = useMemo(() => {
    if (!activeFeedId) return "Feeds"
    return feedList.find((feed) => feed.feedId === activeFeedId)?.title || "Untitled Feed"
  }, [activeFeedId, feedList])

  const activeViewLabel = useMemo(() => {
    switch (activeView) {
      case FeedViewType.All:
        return "All"
      case FeedViewType.Articles:
        return "Articles"
      case FeedViewType.SocialMedia:
        return "Social"
      case FeedViewType.Pictures:
        return "Pictures"
      case FeedViewType.Videos:
        return "Videos"
      case FeedViewType.Audios:
        return "Audios"
      case FeedViewType.Notifications:
        return "Notifications"
      default:
        return "Feeds"
    }
  }, [activeView])

  const mobileTitle =
    mobilePane === "feeds"
      ? `Suhui Remote · ${activeViewLabel}`
      : mobilePane === "entries"
        ? activeFeedId
          ? activeFeedTitle
          : `${activeViewLabel} Entries`
        : "Article"

  const handleSelectFeed = (feedId: string) => {
    setActiveFeedId(feedId)
    setActiveEntryId(null)
    if (isMobile) {
      setMobilePane("entries")
    }
  }

  const handleSelectEntry = (entryId: string | null) => {
    setActiveEntryId(entryId)
    if (isMobile && entryId) {
      setMobilePane("content")
    }
  }

  return (
    <div className="flex h-screen flex-col bg-theme-background">
      {/* 顶部状态栏 */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3 md:px-4">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 truncate text-base font-semibold md:text-lg">{mobileTitle}</h1>
          <span
            className={cn(
              "hidden rounded-full px-2 py-0.5 text-xs sm:inline-flex",
              connected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
            )}
          >
            {connected ? "Online" : "Offline"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm transition-colors md:px-3",
              unreadOnly ? "text-accent-foreground bg-accent" : "bg-muted hover:bg-muted/80",
            )}
            onClick={() => setUnreadOnly(!unreadOnly)}
          >
            {unreadOnly ? "Unread" : "All"}
          </button>
        </div>
      </header>
      <div className="border-b border-border bg-background/70 px-2 py-2 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {availableViews.map((view) => (
            <button
              key={view.view}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
                activeView === view.view
                  ? "text-accent-foreground border-accent bg-accent"
                  : "bg-muted/60 hover:bg-muted border-border",
              )}
              onClick={() => {
                setActiveView(view.view)
                setActiveFeedId(null)
                setActiveEntryId(null)
                if (isMobile) {
                  setMobilePane("entries")
                }
              }}
            >
              {activeView === view.view ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-xs">{view.icon}</span>
                  {activeViewLabelFor(view.view)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-xs">{view.icon}</span>
                  {activeViewLabelFor(view.view)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {isMobile && (
        <div className="border-b border-border bg-background/60 px-2 py-2 backdrop-blur">
          <div className="grid grid-cols-3 gap-2">
            <button
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                mobilePane === "feeds"
                  ? "text-accent-foreground border-accent bg-accent"
                  : "bg-muted hover:bg-muted/80",
              )}
              onClick={() => setMobilePane("feeds")}
            >
              Feeds
            </button>
            <button
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                mobilePane === "entries"
                  ? "text-accent-foreground border-accent bg-accent"
                  : "bg-muted hover:bg-muted/80",
              )}
              onClick={() => setMobilePane("entries")}
            >
              Entries
            </button>
            <button
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                mobilePane === "content"
                  ? "text-accent-foreground border-accent bg-accent"
                  : "bg-muted hover:bg-muted/80",
              )}
              disabled={!activeEntryId}
              onClick={() => setMobilePane("content")}
            >
              Article
            </button>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      {isMobile ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {mobilePane === "feeds" && (
            <FeedList
              feedList={feedList}
              unreadState={unreadState.data}
              activeFeedId={activeFeedId}
              onSelectFeed={handleSelectFeed}
            />
          )}
          {mobilePane === "entries" && (
            <div className="h-full overflow-y-auto">
              <EntryColumn
                feedId={activeFeedId}
                feedIdList={activeFeedId ? undefined : activeFeedIdsForView}
                unreadOnly={unreadOnly}
                activeEntryId={activeEntryId}
                onSelectEntry={handleSelectEntry}
                onSyncEntrySelection={setActiveEntryId}
              />
            </div>
          )}
          {mobilePane === "content" && (
            <div className="h-full overflow-y-auto">
              <EntryContentPanel entryId={activeEntryId} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="w-64 shrink-0 overflow-y-auto border-r border-border bg-sidebar">
            <FeedList
              feedList={feedList}
              unreadState={unreadState.data}
              activeFeedId={activeFeedId}
              onSelectFeed={handleSelectFeed}
            />
          </aside>

          <div className="w-80 shrink-0 overflow-y-auto border-r border-border">
            <EntryColumn
              feedId={activeFeedId}
              unreadOnly={unreadOnly}
              activeEntryId={activeEntryId}
              onSelectEntry={handleSelectEntry}
            />
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto">
            <EntryContentPanel entryId={activeEntryId} />
          </div>
        </div>
      )}
    </div>
  )
}

function activeViewLabelFor(view: FeedViewType) {
  switch (view) {
    case FeedViewType.All:
      return "All"
    case FeedViewType.Articles:
      return "Articles"
    case FeedViewType.SocialMedia:
      return "Social"
    case FeedViewType.Pictures:
      return "Pictures"
    case FeedViewType.Videos:
      return "Videos"
    case FeedViewType.Audios:
      return "Audios"
    case FeedViewType.Notifications:
      return "Notifications"
    default:
      return "Feeds"
  }
}

// ============ 子组件 ============

function FeedList({
  feedList,
  unreadState,
  activeFeedId,
  onSelectFeed,
}: {
  feedList: Array<{
    feedId: string
    title: string | null
    category: string | null
  }>
  unreadState: Record<string, number | undefined>
  activeFeedId: string | null
  onSelectFeed: (feedId: string) => void
}) {
  const PAGE_SIZE = 80
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const visibleFeeds = useMemo(() => feedList.slice(0, visibleCount), [feedList, visibleCount])
  const hasMore = visibleCount < feedList.length

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [feedList])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        setVisibleCount((current) => Math.min(current + PAGE_SIZE, feedList.length))
      },
      { rootMargin: "240px 0px" },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [feedList.length, hasMore])

  return (
    <div className="p-2">
      {visibleFeeds.map((feed) => (
        <FeedItem
          key={feed.feedId}
          title={feed.title}
          category={feed.category}
          unread={unreadState[feed.feedId] ?? 0}
          active={activeFeedId === feed.feedId}
          onClick={() => onSelectFeed(feed.feedId)}
        />
      ))}
      {hasMore && <div ref={loadMoreRef} className="h-8" />}
      {hasMore && (
        <div className="text-muted-foreground px-3 py-2 text-center text-xs">
          Loading more feeds...
        </div>
      )}
    </div>
  )
}

function FeedItem({
  title,
  category,
  unread,
  active,
  onClick,
}: {
  title: string | null
  category: string | null
  unread: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
        active ? "text-accent-foreground bg-accent" : "hover:bg-muted",
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="truncate">{title || "Untitled"}</span>
        {unread > 0 && (
          <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-xs">{unread}</span>
        )}
      </div>
      {category && <div className="text-muted-foreground mt-0.5 text-xs">{category}</div>}
    </button>
  )
}

function EntryColumn({
  feedId,
  feedIdList,
  unreadOnly,
  activeEntryId,
  onSelectEntry,
  onSyncEntrySelection,
}: {
  feedId: string | null
  feedIdList?: string[]
  unreadOnly: boolean
  activeEntryId: string | null
  onSelectEntry: (entryId: string | null) => void
  onSyncEntrySelection?: (entryId: string | null) => void
}) {
  const entriesQuery = useEntriesQuery(
    feedId || (feedIdList && feedIdList.length > 0)
      ? {
          ...(feedId ? { feedId } : { feedIdList }),
          unreadOnly,
          limit: 100,
        }
      : undefined,
  )
  const entryIds = entriesQuery.entriesIds
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !entriesQuery.hasNextPage) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || entriesQuery.isFetchingNextPage) return
        void entriesQuery.fetchNextPage()
      },
      { rootMargin: "240px 0px" },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [
    entriesQuery.fetchNextPage,
    entriesQuery.hasNextPage,
    entriesQuery.isFetchingNextPage,
    entryIds.length,
  ])

  useEffect(() => {
    const syncSelection = onSyncEntrySelection ?? onSelectEntry

    if (entryIds.length === 0) {
      if (activeEntryId) syncSelection(null)
      return
    }

    if (activeEntryId && !entryIds.includes(activeEntryId)) {
      syncSelection(null)
    }
  }, [activeEntryId, entryIds, onSelectEntry, onSyncEntrySelection])

  if (!feedId && (!feedIdList || feedIdList.length === 0)) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        No feeds available in this view
      </div>
    )
  }

  if (entriesQuery.isLoading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        Loading entries...
      </div>
    )
  }

  if (entryIds.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        {unreadOnly ? "No unread entries" : "No entries"}
      </div>
    )
  }

  return (
    <div className="p-2">
      {entryIds.map((entryId) => (
        <EntryItem
          key={entryId}
          entryId={entryId}
          active={activeEntryId === entryId}
          onClick={() => onSelectEntry(entryId)}
        />
      ))}
      {entriesQuery.hasNextPage && <div ref={loadMoreRef} className="h-8" />}
      {entriesQuery.isFetchingNextPage && (
        <div className="text-muted-foreground mt-3 text-center text-sm">Loading...</div>
      )}
    </div>
  )
}

function EntryItem({
  entryId,
  active,
  onClick,
}: {
  entryId: string
  active: boolean
  onClick: () => void
}) {
  const entry = useEntry(entryId, (e) => e)

  if (!entry) return null

  return (
    <button
      className={cn(
        "mb-1 w-full rounded-md px-3 py-2 text-left transition-colors",
        active ? "text-accent-foreground bg-accent" : "hover:bg-muted",
        entry.read && "opacity-60",
      )}
      onClick={onClick}
    >
      <div className="line-clamp-2 text-sm font-medium">{entry.title || "Untitled"}</div>
      <div className="text-muted-foreground mt-1 text-xs">
        {entry.publishedAt ? new Date(entry.publishedAt).toLocaleDateString() : ""}
      </div>
    </button>
  )
}

function EntryContentPanel({ entryId }: { entryId: string | null }) {
  const entry = useEntry(entryId ?? "", (e) => e)
  const feed = useFeedById(entry?.feedId ?? "")

  // 加载完整条目内容
  useEffect(() => {
    if (entryId) {
      void entrySyncServices.fetchEntryDetail(entryId)
    }
  }, [entryId])

  // 自动标记已读
  useEffect(() => {
    if (entryId && entry && !entry.read) {
      void unreadSyncService.markRead(entryId)
    }
  }, [entryId, entry?.read])

  if (!entryId || !entry) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        Select an entry to read
      </div>
    )
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-6 sm:px-6 md:px-8 md:py-12">
      {/* 标题 */}
      <h1 className="text-xl font-bold leading-tight md:text-2xl">{entry.title || "Untitled"}</h1>

      {/* 元信息 */}
      <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-2 text-sm">
        {feed?.title && <span>{feed.title}</span>}
        {entry.author && <span>· {entry.author}</span>}
        {entry.publishedAt && <span>· {new Date(entry.publishedAt).toLocaleString()}</span>}
      </div>

      {/* 操作按钮 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {entry.url && (
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-muted hover:bg-muted/80 rounded-md px-3 py-1.5 text-sm"
          >
            Open Original
          </a>
        )}
        <button
          className="bg-muted hover:bg-muted/80 rounded-md px-3 py-1.5 text-sm"
          onClick={() => {
            if (entry.read) {
              void unreadSyncService.markUnread(entryId)
            } else {
              void unreadSyncService.markRead(entryId)
            }
          }}
        >
          {entry.read ? "Mark Unread" : "Mark Read"}
        </button>
      </div>

      {/* 内容 */}
      <div
        className="prose prose-neutral mt-8 max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{
          __html: entry.readabilityContent || entry.content || "<p>No content available.</p>",
        }}
      />
    </article>
  )
}
