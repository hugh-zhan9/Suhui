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
import { runtimeClient } from "@suhui/store/runtime"

// ============ 远程端应用 ============

export function RemoteApp() {
  const isMobile = useMobile()
  const [activeView, setActiveView] = useState<FeedViewType>(FeedViewType.All)
  const [activeFeedId, setActiveFeedId] = useState<string | null>(null)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [connected, setConnected] = useState(true)
  const [mobilePane, setMobilePane] = useState<"feeds" | "entries" | "content">("entries")
  const [managementOpen, setManagementOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
            className="bg-muted hover:bg-muted/80 rounded-md px-2.5 py-1.5 text-sm transition-colors md:px-3"
            onClick={() => setManagementOpen(true)}
          >
            Manage
          </button>
          <button
            className="bg-muted hover:bg-muted/80 rounded-md px-2.5 py-1.5 text-sm transition-colors md:px-3"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
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
      {managementOpen && (
        <SubscriptionManagementPanel
          subscriptions={Object.values(subscriptionState.data).filter(
            (subscription) => subscription.type === "feed" && !!subscription.feedId,
          )}
          onClose={() => setManagementOpen(false)}
        />
      )}
      {settingsOpen && <RemoteSettingsPanel onClose={() => setSettingsOpen(false)} />}
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
  const [pdfBusy, setPdfBusy] = useState(false)

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
        <button
          className="bg-muted hover:bg-muted/80 rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={pdfBusy}
          onClick={async () => {
            setPdfBusy(true)
            try {
              const blob = await runtimeClient.pdf.exportEntry(entryId)
              const url = URL.createObjectURL(blob)
              const link = document.createElement("a")
              link.href = url
              link.download = `${entry.title || entryId}.pdf`
              link.click()
              URL.revokeObjectURL(url)
            } finally {
              setPdfBusy(false)
            }
          }}
        >
          PDF
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

function SubscriptionManagementPanel({
  subscriptions,
  onClose,
}: {
  subscriptions: Array<{
    feedId?: string | null
    title?: string | null
    category?: string | null
    view: FeedViewType
  }>
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [view, setView] = useState<FeedViewType>(FeedViewType.Articles)
  const [batchCategory, setBatchCategory] = useState("")
  const [batchView, setBatchView] = useState<FeedViewType>(FeedViewType.Articles)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<
    Record<string, { title: string; category: string; view: FeedViewType }>
  >({})

  const selectedFeedIds = Array.from(selected)
  const refreshRemoteStores = async () => {
    await Promise.all([remoteSSEHandler.refreshSubscriptions(), remoteSSEHandler.refreshUnread()])
  }
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    try {
      await task()
      await refreshRemoteStores()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95">
      <div className="flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-base font-semibold">Subscriptions</h2>
          <button
            className="bg-muted hover:bg-muted/80 rounded-md px-3 py-1.5 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[360px_1fr]">
          <aside className="overflow-y-auto border-b border-border p-4 md:border-b-0 md:border-r">
            <div className="space-y-3">
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="Feed URL"
              />
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
              />
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Category"
              />
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={view}
                onChange={(event) => setView(Number(event.target.value) as FeedViewType)}
              >
                {getViewList({ includeAll: false }).map((item) => (
                  <option key={item.view} value={item.view}>
                    {activeViewLabelFor(item.view)}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="bg-muted hover:bg-muted/80 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                  disabled={busy || !url.trim()}
                  onClick={() =>
                    run(async () => {
                      await runtimeClient.subscriptions.create({
                        url,
                        title: title || undefined,
                        category: category || undefined,
                        view,
                        feedId: null,
                        hideFromTimeline: false,
                        isPrivate: false,
                        listId: undefined,
                      })
                      setUrl("")
                      setTitle("")
                    })
                  }
                >
                  Add
                </button>
                <button
                  className="bg-muted hover:bg-muted/80 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                  disabled={busy || !url.trim()}
                  onClick={() =>
                    run(async () => {
                      await runtimeClient.feeds.preview({ url, allowPublicRsshub: true })
                    })
                  }
                >
                  Preview
                </button>
              </div>
              <div className="border-t border-border pt-3">
                <input
                  className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={batchCategory}
                  onChange={(event) => setBatchCategory(event.target.value)}
                  placeholder="Batch category"
                />
                <select
                  className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={batchView}
                  onChange={(event) => setBatchView(Number(event.target.value) as FeedViewType)}
                >
                  {getViewList({ includeAll: false }).map((item) => (
                    <option key={item.view} value={item.view}>
                      {activeViewLabelFor(item.view)}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="bg-muted hover:bg-muted/80 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                    disabled={busy || selectedFeedIds.length === 0}
                    onClick={() =>
                      run(async () => {
                        await runtimeClient.subscriptions.batchUpdate({
                          feedIds: selectedFeedIds,
                          category: batchCategory || null,
                          view: batchView,
                        })
                      })
                    }
                  >
                    Apply
                  </button>
                  <button
                    className="bg-muted hover:bg-muted/80 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                    disabled={busy || selectedFeedIds.length === 0}
                    onClick={() =>
                      run(async () => {
                        await runtimeClient.subscriptions.deleteByTargets({
                          feedIds: selectedFeedIds,
                        })
                        setSelected(new Set())
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
                <button
                  className="bg-muted hover:bg-muted/80 mt-2 w-full rounded-md px-3 py-2 text-sm disabled:opacity-50"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (selectedFeedIds.length === 1) {
                        await runtimeClient.feeds.refresh(selectedFeedIds[0]!)
                      } else {
                        await runtimeClient.feeds.refresh()
                      }
                    })
                  }
                >
                  Refresh
                </button>
              </div>
            </div>
          </aside>
          <main className="overflow-y-auto p-4">
            <div className="space-y-2">
              {subscriptions.map((subscription) => {
                const feedId = subscription.feedId!
                const draft = editing[feedId] ?? {
                  title: subscription.title || "",
                  category: subscription.category || "",
                  view: subscription.view,
                }
                return (
                  <div
                    key={feedId}
                    className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[24px_1fr_160px_140px_120px]"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(feedId)}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(feedId)
                          else next.delete(feedId)
                          return next
                        })
                      }
                    />
                    <input
                      className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      value={draft.title}
                      onChange={(event) =>
                        setEditing((current) => ({
                          ...current,
                          [feedId]: { ...draft, title: event.target.value },
                        }))
                      }
                    />
                    <input
                      className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      value={draft.category}
                      onChange={(event) =>
                        setEditing((current) => ({
                          ...current,
                          [feedId]: { ...draft, category: event.target.value },
                        }))
                      }
                    />
                    <select
                      className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      value={draft.view}
                      onChange={(event) =>
                        setEditing((current) => ({
                          ...current,
                          [feedId]: { ...draft, view: Number(event.target.value) as FeedViewType },
                        }))
                      }
                    >
                      {getViewList({ includeAll: false }).map((item) => (
                        <option key={item.view} value={item.view}>
                          {activeViewLabelFor(item.view)}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="bg-muted hover:bg-muted/80 rounded-md px-2 py-1.5 text-sm disabled:opacity-50"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await runtimeClient.subscriptions.updateById(`feed/${feedId}`, {
                              title: draft.title || null,
                              category: draft.category || null,
                              view: draft.view,
                            })
                          })
                        }
                      >
                        Save
                      </button>
                      <button
                        className="bg-muted hover:bg-muted/80 rounded-md px-2 py-1.5 text-sm disabled:opacity-50"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await runtimeClient.subscriptions.deleteByTargets({
                              ids: [`feed/${feedId}`],
                            })
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

function RemoteSettingsPanel({ onClose }: { onClose: () => void }) {
  const [appearance, setAppearance] = useState<"light" | "dark" | "system">("system")
  const [rsshubCustomUrl, setRsshubCustomUrl] = useState("")
  const [exportText, setExportText] = useState("")
  const [importText, setImportText] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void runtimeClient.settings.get().then((settings) => {
      setAppearance(settings.appearance)
      setRsshubCustomUrl(settings.rsshubCustomUrl)
    })
  }, [])

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95">
      <div className="flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            className="bg-muted hover:bg-muted/80 rounded-md px-3 py-1.5 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <main className="mx-auto grid w-full max-w-5xl gap-4 overflow-y-auto p-4 md:grid-cols-2">
          <section className="space-y-3">
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={appearance}
              onChange={(event) => setAppearance(event.target.value as typeof appearance)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={rsshubCustomUrl}
              onChange={(event) => setRsshubCustomUrl(event.target.value)}
              placeholder="RSSHub URL"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                className="bg-muted hover:bg-muted/80 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await runtimeClient.settings.update({ appearance, rsshubCustomUrl })
                  })
                }
              >
                Save
              </button>
              <button
                className="bg-muted hover:bg-muted/80 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await runtimeClient.rsshub.precheck({
                      url: "rsshub://rsshub/routes",
                      allowPublicFallback: true,
                    })
                  })
                }
              >
                Precheck
              </button>
            </div>
          </section>
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                className="bg-muted hover:bg-muted/80 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const data = await runtimeClient.importExport.exportData()
                    setExportText(JSON.stringify(data, null, 2))
                  })
                }
              >
                Export
              </button>
              <button
                className="bg-muted hover:bg-muted/80 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                disabled={busy || !importText.trim()}
                onClick={() =>
                  run(async () => {
                    await runtimeClient.importExport.importData(importText)
                    await Promise.all([
                      remoteSSEHandler.refreshSubscriptions(),
                      remoteSSEHandler.refreshUnread(),
                    ])
                  })
                }
              >
                Import
              </button>
            </div>
            <textarea
              className="h-48 w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
              value={exportText}
              readOnly
            />
            <textarea
              className="h-48 w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
          </section>
        </main>
      </div>
    </div>
  )
}
