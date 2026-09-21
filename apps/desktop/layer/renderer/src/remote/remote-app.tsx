/**
 * Desktop-shaped remote reader.
 *
 * This entry is still browser-safe: all writes go through runtimeClient and the
 * Electron main-hosted HTTP adapter. It intentionally avoids passive read-state
 * writes so opening the Web client cannot consume unread articles.
 */

import { FeedViewType, getViewList } from "@suhui/constants"
import { useSyncThemeWebApp } from "@suhui/hooks"
import { useIsEntryStarred } from "@suhui/store/collection/hooks"
import { collectionActions, useCollectionStore } from "@suhui/store/collection/store"
import { getEntry } from "@suhui/store/entry/getter"
import { useEntriesQuery, useEntry } from "@suhui/store/entry/hooks"
import { entrySyncServices } from "@suhui/store/entry/store"
import { useFeedById } from "@suhui/store/feed/hooks"
import { runtimeClient } from "@suhui/store/runtime"
import { useSubscriptionStore } from "@suhui/store/subscription/store"
import { unreadSyncService, useUnreadStore } from "@suhui/store/unread/store"
import { cn } from "@suhui/utils/utils"
import type { MouseEvent } from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { normalizeRssTitleForRender } from "~/lib/rss-content-normalize"

import type { RemoteBootstrapViewState, RemoteConnectionPhase } from "./remote-bootstrap"
import { useRemoteBootstrap, useRemoteConnection } from "./remote-bootstrap"
import type { RemoteMobileTab } from "./remote-mobile"
import { useRemoteMobile } from "./remote-mobile"
import { RemoteMobileTabBar } from "./remote-mobile-shell"
import { markRemoteDataReadyIfComplete, markRemoteMetric } from "./remote-performance"
import type { RemoteFeedGroup, RemoteFeedSummary } from "./remote-view-model"
import {
  buildRemoteFeedGroups,
  getRemoteAvailableViews,
  getRemoteDesktopLayoutContract,
  getRemoteEntryReadVisualState,
  getRemoteFeedList,
  getRemotePreferredEntrySelection,
  parseRemoteImportPayload,
  remoteViewLabelFor,
  shouldRemoteMarkReadFromSelection,
  toRemoteDownloadFileName,
} from "./remote-view-model"
import { sanitizeArticleHtml } from "./sanitize-article-html"

type Pane = "feeds" | "entries" | "content"
type Overlay = "subscriptions" | "settings" | null

const layoutContract = getRemoteDesktopLayoutContract()

export function RemoteApp() {
  // Without this nothing sets `data-theme` on <html>, and colors.css scopes
  // --fo-background (and the rest of the palette) to that attribute — leaving
  // the overlay panel with no background at all, so settings rendered straight
  // on top of the timeline.
  useSyncThemeWebApp()

  const isMobile = useRemoteMobile()
  const subscriptionState = useSubscriptionStore()
  const unreadState = useUnreadStore()
  const bootstrap = useRemoteBootstrap()
  const connectionPhase = useRemoteConnection()

  const [activeView, setActiveView] = useState<FeedViewType>(FeedViewType.All)
  const [activeFeedId, setActiveFeedId] = useState<string | null>(null)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [initialEntriesReady, setInitialEntriesReady] = useState(false)
  const [mobilePane, setMobilePane] = useState<Pane>("entries")
  const [overlay, setOverlay] = useState<Overlay>(null)

  const subscriptions = subscriptionState.data as Record<string, any>
  const availableViews = useMemo(() => getRemoteAvailableViews(subscriptions), [subscriptions])
  const feedGroups = useMemo(
    () => buildRemoteFeedGroups(subscriptions, activeView),
    [activeView, subscriptions],
  )
  const feedList = useMemo(
    () => getRemoteFeedList(subscriptions, activeView),
    [activeView, subscriptions],
  )
  const activeFeedIdsForView = useMemo(() => feedList.map((feed) => feed.feedId), [feedList])
  const feedSubscriptions = useMemo(
    () =>
      Object.values(subscriptions).filter(
        (subscription) => subscription.type === "feed" && !!subscription.feedId,
      ),
    [subscriptions],
  )

  useLayoutEffect(() => {
    markRemoteMetric("remote_shell_visible_ms")
  }, [])

  useEffect(() => {
    markRemoteDataReadyIfComplete({
      bootstrapReady: bootstrap.phase === "ready",
      initialEntriesReady,
    })
  }, [bootstrap.phase, initialEntriesReady])

  useEffect(() => {
    if (availableViews.length === 0) return
    if (availableViews.some((view) => view.view === activeView)) return
    setActiveView(availableViews[0]?.view ?? FeedViewType.All)
  }, [activeView, availableViews])

  useEffect(() => {
    if (isMobile) return
    if (!activeFeedId && feedList[0]) setActiveFeedId(feedList[0].feedId)
  }, [activeFeedId, feedList, isMobile])

  useEffect(() => {
    if (!activeFeedId) return
    if (feedList.some((feed) => feed.feedId === activeFeedId)) return
    setActiveFeedId(isMobile ? null : (feedList[0]?.feedId ?? null))
    setActiveEntryId(null)
  }, [activeFeedId, feedList, isMobile])

  useEffect(() => {
    if (!isMobile) return
    if (mobilePane === "content" && !activeEntryId) setMobilePane("entries")
  }, [activeEntryId, isMobile, mobilePane])

  const activeFeedTitle = useMemo(
    () => feedList.find((feed) => feed.feedId === activeFeedId)?.title || "全部订阅",
    [activeFeedId, feedList],
  )

  const selectView = (view: FeedViewType) => {
    setActiveView(view)
    setActiveFeedId(null)
    setActiveEntryId(null)
    if (isMobile) setMobilePane("entries")
  }

  const selectFeed = (feedId: string | null) => {
    setActiveFeedId(feedId)
    setActiveEntryId(null)
    if (isMobile) setMobilePane("entries")
  }

  const selectEntry = (entryId: string | null) => {
    if (entryId) {
      const entry = getEntry(entryId)
      if (
        shouldRemoteMarkReadFromSelection({
          entryId,
          read: entry?.read,
          reason: "user-open",
        })
      ) {
        void unreadSyncService.markRead(entryId)
      }
    }
    setActiveEntryId(entryId)
    if (isMobile && entryId) setMobilePane("content")
  }

  // The bottom tabs are the source of truth for where the user is; the existing
  // pane state stays underneath as this tab's navigation stack.
  const mobileTab: RemoteMobileTab =
    overlay === "settings" ? "settings" : mobilePane === "feeds" ? "subscriptions" : "timeline"

  const selectMobileTab = (tab: RemoteMobileTab) => {
    if (tab === "settings") {
      setOverlay("settings")
      return
    }
    setOverlay(null)
    // Tapping a tab returns to its root, the way the desktop app's tabs do.
    setMobilePane(tab === "subscriptions" ? "feeds" : "entries")
  }

  const totalUnreadForTabs = useMemo(
    () => feedList.reduce((sum, feed) => sum + (unreadState.data[feed.feedId] ?? 0), 0),
    [feedList, unreadState.data],
  )

  return (
    <div
      className={cn(layoutContract.root, isMobile && "is-remote-mobile")}
      data-remote-layout={isMobile ? "mobile-reader" : "desktop-reader"}
      data-testid="remote-reader-shell"
    >
      <RemoteDesktopSidebar
        activeFeedId={activeFeedId}
        activeView={activeView}
        availableViews={availableViews}
        bootstrap={bootstrap}
        connectionPhase={connectionPhase}
        feedGroups={feedGroups}
        feedList={feedList}
        hidden={isMobile && mobilePane !== "feeds"}
        onOpenSubscriptions={() => setOverlay("subscriptions")}
        onOpenSettings={() => setOverlay("settings")}
        onSelectFeed={selectFeed}
        onSelectView={selectView}
        unreadState={unreadState.data}
      />

      <RemoteDesktopTimeline
        activeEntryId={activeEntryId}
        activeFeedId={activeFeedId}
        activeFeedIdsForView={activeFeedIdsForView}
        activeFeedTitle={activeFeedTitle}
        activeView={activeView}
        bootstrapPhase={bootstrap.phase}
        hidden={isMobile && mobilePane !== "entries"}
        isMobile={isMobile}
        onOpenSubscriptions={() => setOverlay("subscriptions")}
        onRefresh={() => runtimeClient.feeds.refresh(activeFeedId || undefined)}
        onSelectEntry={selectEntry}
        onInitialEntriesReady={() => setInitialEntriesReady(true)}
        onSyncEntrySelection={setActiveEntryId}
        onToggleUnreadOnly={() => setUnreadOnly((value) => !value)}
        unreadOnly={unreadOnly}
      />

      <RemoteDesktopReaderPane
        activeView={activeView}
        entryId={activeEntryId}
        hidden={isMobile && mobilePane !== "content"}
        onBackToList={() => setMobilePane("entries")}
        privateLocalReading={bootstrap.privateLocalReading}
      />

      {overlay === "subscriptions" && (
        <RemoteSubscriptionsOverlay
          subscriptions={feedSubscriptions}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === "settings" && <RemoteSettingsOverlay onClose={() => setOverlay(null)} />}

      {isMobile && (
        <RemoteMobileTabBar
          activeTab={mobileTab}
          unreadCount={totalUnreadForTabs}
          onChange={selectMobileTab}
        />
      )}
    </div>
  )
}

function RemoteDesktopSidebar({
  activeFeedId,
  activeView,
  availableViews,
  bootstrap,
  connectionPhase,
  feedGroups,
  feedList,
  hidden,
  onOpenSubscriptions,
  onOpenSettings,
  onSelectFeed,
  onSelectView,
  unreadState,
}: {
  activeFeedId: string | null
  activeView: FeedViewType
  availableViews: ReturnType<typeof getRemoteAvailableViews>
  bootstrap: RemoteBootstrapViewState
  connectionPhase: RemoteConnectionPhase
  feedGroups: RemoteFeedGroup[]
  feedList: RemoteFeedSummary[]
  hidden: boolean
  onOpenSubscriptions: () => void
  onOpenSettings: () => void
  onSelectFeed: (feedId: string | null) => void
  onSelectView: (view: FeedViewType) => void
  unreadState: Record<string, number | undefined>
}) {
  const totalUnread = feedList.reduce((sum, feed) => sum + (unreadState[feed.feedId] ?? 0), 0)

  return (
    <aside
      className={cn(layoutContract.sidebar, hidden && "remote-pane-hidden")}
      style={{ width: layoutContract.sidebarWidth }}
    >
      <div className="remote-sidebar-header">
        <div className="remote-app-mark">
          <div className="remote-app-icon">
            <i className="i-mgc-rss-cute-fi" />
          </div>
          <div className="remote-app-copy">
            <div className="remote-app-title">溯洄</div>
            <div className="remote-connection" data-connection-phase={connectionPhase}>
              <span className={cn("remote-connection-dot", `is-${connectionPhase}`)} />
              {connectionPhase === "connected"
                ? "已连接"
                : connectionPhase === "connecting"
                  ? "连接中"
                  : "已断开"}
            </div>
          </div>
        </div>
        <div className="remote-sidebar-actions">
          <IconButton icon="i-mgc-settings-1-cute-re" label="设置" onClick={onOpenSettings} />
          <IconButton icon="i-mgc-add-cute-re" label="订阅管理" onClick={onOpenSubscriptions} />
        </div>
      </div>

      <nav className="remote-view-tabs" aria-label="视图">
        {bootstrap.phase === "ready" &&
          availableViews.map((view) => (
            <button
              key={view.view}
              className={cn("remote-view-tab", activeView === view.view && "is-active")}
              title={remoteViewLabelFor(view.view)}
              onClick={() => onSelectView(view.view)}
            >
              <span className="remote-view-icon">{view.icon}</span>
            </button>
          ))}
      </nav>

      {bootstrap.phase === "ready" && (
        <button
          className={cn(
            "remote-source-row remote-source-all",
            activeFeedId === null && "is-active",
          )}
          onClick={() => onSelectFeed(null)}
        >
          <span className="remote-source-icon">
            <i className="i-mgc-inbox-cute-fi" />
          </span>
          <span className="remote-source-title">全部订阅</span>
          {totalUnread > 0 && <UnreadBadge count={totalUnread} />}
        </button>
      )}

      <div className="remote-source-scroll">
        {bootstrap.phase === "loading" ? (
          <RemotePaneSkeleton label="正在加载订阅" rows={7} />
        ) : bootstrap.phase === "error" ? (
          <RemotePaneError
            action="重试加载订阅"
            description={bootstrap.error || "桌面端没有返回订阅数据。"}
            onRetry={bootstrap.retry}
            title="订阅加载失败"
          />
        ) : feedGroups.length === 0 ? (
          <RemoteEmptyState
            icon="i-mgc-rss-cute-fi"
            title="还没有订阅"
            description="在订阅面板里添加订阅。"
          />
        ) : (
          feedGroups.map((group) => (
            <section key={group.key} className="remote-source-group">
              <div className="remote-source-group-title">{group.title}</div>
              <div className="remote-source-group-list">
                {group.feeds.map((feed) => (
                  <FeedButton
                    key={feed.feedId}
                    active={activeFeedId === feed.feedId}
                    feed={feed}
                    unread={unreadState[feed.feedId] ?? 0}
                    onClick={() => onSelectFeed(feed.feedId)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </aside>
  )
}

function FeedButton({
  active,
  feed,
  unread,
  onClick,
}: {
  active: boolean
  feed: RemoteFeedSummary
  unread: number
  onClick: () => void
}) {
  return (
    <button className={cn("remote-source-row", active && "is-active")} onClick={onClick}>
      <span className="remote-source-icon">
        <i className="i-mgc-rss-cute-fi" />
      </span>
      <span className="remote-source-title">{feed.title || "无标题"}</span>
      {unread > 0 && <UnreadBadge count={unread} />}
    </button>
  )
}

function RemoteDesktopTimeline({
  activeEntryId,
  activeFeedId,
  activeFeedIdsForView,
  activeFeedTitle,
  activeView,
  bootstrapPhase,
  hidden,
  isMobile,
  onOpenSubscriptions,
  onRefresh,
  onSelectEntry,
  onInitialEntriesReady,
  onSyncEntrySelection,
  onToggleUnreadOnly,
  unreadOnly,
}: {
  activeEntryId: string | null
  activeFeedId: string | null
  activeFeedIdsForView: string[]
  activeFeedTitle: string
  activeView: FeedViewType
  bootstrapPhase: RemoteBootstrapViewState["phase"]
  hidden: boolean
  isMobile: boolean
  onOpenSubscriptions: () => void
  onRefresh: () => Promise<unknown> | unknown
  onSelectEntry: (entryId: string | null) => void
  onInitialEntriesReady: () => void
  onSyncEntrySelection: (entryId: string | null) => void
  onToggleUnreadOnly: () => void
  unreadOnly: boolean
}) {
  const [refreshing, setRefreshing] = useState(false)
  const feedIdList = activeFeedId ? undefined : activeFeedIdsForView
  const hasEntryScope = !!activeFeedId || !!feedIdList?.length
  const entriesQuery = useEntriesQuery(
    hasEntryScope
      ? {
          ...(activeFeedId ? { feedId: activeFeedId } : { feedIdList }),
          enabled: bootstrapPhase === "ready",
          unreadOnly,
          limit: 20,
        }
      : undefined,
  )
  const entryIds = entriesQuery.entriesIds
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const previousEntryIdsRef = useRef<string[]>([])
  const initialReadyRecordedRef = useRef(false)

  useEffect(() => {
    const confirmedEmpty = bootstrapPhase === "ready" && !hasEntryScope
    if (initialReadyRecordedRef.current || (!confirmedEmpty && !entriesQuery.isSuccess)) return
    initialReadyRecordedRef.current = true
    markRemoteMetric("remote_initial_entries_ready_ms")
    onInitialEntriesReady()
  }, [bootstrapPhase, entriesQuery.isSuccess, hasEntryScope, onInitialEntriesReady])

  useEffect(() => {
    if (bootstrapPhase === "ready" && entriesQuery.isError) {
      markRemoteMetric("remote_entries_error_visible_ms")
    }
  }, [bootstrapPhase, entriesQuery.isError])

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
    const previousEntryIds = previousEntryIdsRef.current
    const preferredEntryId = getRemotePreferredEntrySelection(
      activeEntryId,
      entryIds,
      isMobile,
      previousEntryIds,
    )
    previousEntryIdsRef.current = entryIds
    if (preferredEntryId !== activeEntryId) onSyncEntrySelection(preferredEntryId)
  }, [activeEntryId, entryIds, isMobile, onSyncEntrySelection])

  const runRefresh = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section
      className={cn(layoutContract.timeline, hidden && "remote-pane-hidden")}
      style={{ width: layoutContract.timelineWidth }}
    >
      <header className="remote-timeline-header">
        <div className="remote-timeline-title-block">
          <div className="remote-timeline-title">{activeFeedTitle}</div>
          <div className="remote-timeline-subtitle">
            {remoteViewLabelFor(activeView)}
            {unreadOnly ? " / Unread Only" : ""}
          </div>
        </div>
        <div className="remote-toolbar">
          <button
            className={cn("remote-filter-button", unreadOnly && "is-active")}
            aria-pressed={unreadOnly}
            onClick={onToggleUnreadOnly}
          >
            <i className="i-mgc-round-cute-fi" />
            <span>{unreadOnly ? "仅未读" : "全部"}</span>
          </button>
          <IconButton
            busy={refreshing}
            icon="i-mgc-refresh-2-cute-re"
            label={activeFeedId ? "刷新订阅" : "全部刷新"}
            onClick={runRefresh}
          />
          <IconButton icon="i-mgc-more-2-cute-re" label="订阅管理" onClick={onOpenSubscriptions} />
        </div>
      </header>

      <div className="remote-entry-scroll">
        {bootstrapPhase === "error" ? (
          <RemoteEmptyState
            icon="i-mgc-information-cute-re"
            title="等待订阅加载"
            description="请在订阅面板重试加载。"
          />
        ) : bootstrapPhase === "loading" || entriesQuery.isLoading ? (
          <RemotePaneSkeleton label="正在加载文章" rows={6} />
        ) : entriesQuery.isError ? (
          <RemotePaneError
            action="重试加载文章"
            description="The entry page could not be loaded. Your subscriptions remain available."
            onRetry={() => void entriesQuery.refetch()}
            title="文章加载失败"
          />
        ) : !activeFeedId && activeFeedIdsForView.length === 0 ? (
          <RemoteEmptyState
            icon="i-mgc-rss-cute-fi"
            title="该视图下没有订阅"
            description="换一个视图，或添加订阅。"
          />
        ) : entryIds.length === 0 ? (
          <RemoteEmptyState
            icon="i-mgc-docment-cute-re"
            title={unreadOnly ? "没有未读文章" : "没有文章"}
            description="刷新订阅，或换一个订阅看看。"
          />
        ) : (
          <div className="remote-entry-list">
            {entryIds.map((entryId) => (
              <RemoteEntryItem
                key={entryId}
                active={activeEntryId === entryId}
                entryId={entryId}
                onClick={() => onSelectEntry(entryId)}
                view={activeView}
              />
            ))}
            {entriesQuery.hasNextPage && <div ref={loadMoreRef} className="remote-load-more" />}
            {entriesQuery.isFetchingNextPage && (
              <div className="remote-loading-more">Loading more...</div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function RemoteEntryItem({
  active,
  entryId,
  onClick,
  view,
}: {
  active: boolean
  entryId: string
  onClick: () => void
  view: FeedViewType
}) {
  const entry = useEntry(entryId, (state) => state)
  const feed = useFeedById(entry?.feedId ?? "")
  const readVisualState = getRemoteEntryReadVisualState(entry?.read ?? true)

  if (!entry) return null

  return (
    <div
      className={cn("remote-entry-item", readVisualState.rowClassName, active && "is-active")}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key !== "确定" && event.key !== " ") return
        event.preventDefault()
        onClick()
      }}
    >
      <span
        aria-hidden="true"
        className={cn("remote-entry-unread-dot", readVisualState.unreadDotClassName)}
      />
      <div className="remote-entry-body">
        <div className="remote-entry-feed-row">
          <span className="remote-entry-feed">{feed?.title || "Feed"}</span>
          {entry.publishedAt && (
            <span className="remote-entry-time">
              {new Date(entry.publishedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className={cn("remote-entry-title", readVisualState.titleClassName)}>
          {normalizeRssTitleForRender(entry.title) || "无标题"}
        </div>
        {entry.description && <div className="remote-entry-description">{entry.description}</div>}
      </div>
      <RemoteEntryStarButton entryId={entryId} feedId={entry.feedId} view={view} />
    </div>
  )
}

function RemoteEntryStarButton({
  entryId,
  feedId,
  view,
}: {
  entryId: string
  feedId?: string | null
  view: FeedViewType
}) {
  const isStarred = useIsEntryStarred(entryId)
  const [busy, setBusy] = useState(false)

  const toggleStar = async (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (busy) return
    setBusy(true)

    const nextStarred = !isStarred
    const snapshot = useCollectionStore.getState().collections[entryId]
    if (nextStarred) {
      collectionActions.upsertManyInSession([
        {
          createdAt: new Date().toISOString(),
          entryId,
          feedId: feedId || null,
          view,
        },
      ])
    } else {
      collectionActions.deleteInSession(entryId)
    }

    try {
      await runtimeClient.collections.updateEntryStar({
        entryId,
        starred: nextStarred,
        view,
      })
    } catch (error) {
      if (snapshot) collectionActions.upsertManyInSession([snapshot])
      else collectionActions.deleteInSession(entryId)
      console.error("[Remote] Failed to update star state", error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      aria-pressed={isStarred}
      className={cn("remote-entry-star-button", isStarred && "is-starred")}
      disabled={busy}
      title={isStarred ? "取消收藏" : "Star"}
      onClick={toggleStar}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <i className={isStarred ? "i-mgc-star-cute-fi" : "i-mgc-star-cute-re"} />
    </button>
  )
}

function RemoteDesktopReaderPane({
  activeView,
  entryId,
  hidden,
  onBackToList,
  privateLocalReading,
}: {
  activeView: FeedViewType
  entryId: string | null
  hidden: boolean
  onBackToList: () => void
  privateLocalReading: boolean
}) {
  const entry = useEntry(entryId ?? "", (state) => state)
  const feed = useFeedById(entry?.feedId ?? "")
  const [pdfBusy, setPdfBusy] = useState(false)
  const [queueBusy, setQueueBusy] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [annotations, setAnnotations] = useState<{
    notes: Array<{ id: string; content: string; updatedAt: number }>
    highlights: Array<{ id: string; quote: string; status: "active" | "orphaned" }>
  }>({ notes: [], highlights: [] })
  const [actionError, setActionError] = useState<string | null>(null)
  const [readability, setReadability] = useState<{ entryId: string; content: string } | null>(null)

  useEffect(() => {
    if (entryId) {
      void entrySyncServices.fetchEntryDetail(entryId)
      if (privateLocalReading) {
        void runtimeClient.annotations
          .list(entryId)
          .then((value) => setAnnotations(value ?? { notes: [], highlights: [] }))
          .catch(() => setAnnotations({ notes: [], highlights: [] }))
      } else {
        setAnnotations({ notes: [], highlights: [] })
      }
    } else {
      setAnnotations({ notes: [], highlights: [] })
    }
  }, [entryId, privateLocalReading])

  // Reading mode is the default here, so an entry without a cached body gets
  // one extracted on open. A failure is silent: the feed's own content still
  // renders, which is what a reader would otherwise have seen anyway.
  useEffect(() => {
    if (!entryId) {
      setReadability(null)
      return
    }
    let cancelled = false
    void runtimeClient.entries
      .ensureReadability(entryId)
      .then((content) => {
        if (cancelled || !content) return
        setReadability({ entryId, content })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [entryId])

  const addToQueue = async () => {
    if (!entryId) return
    setQueueBusy(true)
    setActionError(null)
    try {
      await runtimeClient.readingQueue.add(entryId)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "稍后读更新失败")
    } finally {
      setQueueBusy(false)
    }
  }

  const addNote = async () => {
    if (!entryId || !noteText.trim()) return
    setActionError(null)
    try {
      await runtimeClient.annotations.createNote(entryId, noteText)
      setNoteText("")
      setAnnotations(await runtimeClient.annotations.list(entryId))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "笔记保存失败")
    }
  }

  const toggleRead = async () => {
    if (!entryId || !entry) return
    setActionError(null)
    if (entry.read) await unreadSyncService.markUnread(entryId)
    else await unreadSyncService.markRead(entryId)
  }

  const exportPdf = async () => {
    if (!entryId || !entry) return
    setPdfBusy(true)
    setActionError(null)
    try {
      const blob = await runtimeClient.pdf.exportEntry(entryId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = toRemoteDownloadFileName(entry.title, entryId)
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "PDF 导出失败")
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <article className={cn(layoutContract.reader, hidden && "remote-pane-hidden")}>
      <header className="remote-reader-header">
        <button className="remote-mobile-back" onClick={onBackToList}>
          <i className="i-mgc-left-cute-fi" />
        </button>
        <div className="remote-reader-title-block">
          <div className="remote-reader-kicker">
            {feed?.title || remoteViewLabelFor(activeView)}
          </div>
          <div className="remote-reader-title">
            {normalizeRssTitleForRender(entry?.title) || "选择一篇文章"}
          </div>
        </div>
        <div className="remote-toolbar">
          {entryId && (
            <RemoteEntryStarButton entryId={entryId} feedId={entry?.feedId} view={activeView} />
          )}
          {entry?.url && (
            <a
              className="remote-icon-button"
              href={entry.url}
              rel="noopener noreferrer"
              target="_blank"
              title="打开原文"
            >
              <i className="i-mgc-external-link-cute-re" />
            </a>
          )}
          <IconButton
            disabled={!entryId}
            icon="i-mgc-check-circle-cute-re"
            label={entry?.read ? "标记未读" : "标记已读"}
            onClick={toggleRead}
          />
          {privateLocalReading && (
            <IconButton
              busy={queueBusy}
              disabled={!entryId}
              icon="i-mgc-time-cute-re"
              label="稍后读"
              onClick={addToQueue}
            />
          )}
          <IconButton
            busy={pdfBusy}
            disabled={!entryId}
            icon="i-mgc-download-2-cute-re"
            label="导出 PDF"
            onClick={exportPdf}
          />
        </div>
      </header>

      {!entryId || !entry ? (
        <RemoteEmptyState
          icon="i-mgc-docment-cute-re"
          title="选择一篇文章"
          description="从列表里选一篇文章，在这里阅读。"
        />
      ) : (
        <div className="remote-reader-scroll">
          <div className="remote-article-shell">
            <h1 className="remote-article-title">
              {normalizeRssTitleForRender(entry.title) || "无标题"}
            </h1>
            <div className="remote-article-meta">
              {feed?.title && <span>{feed.title}</span>}
              {entry.author && <span>{entry.author}</span>}
              {entry.publishedAt && <span>{new Date(entry.publishedAt).toLocaleString()}</span>}
            </div>
            {actionError && <div className="remote-action-error">{actionError}</div>}
            <div
              className="remote-entry-content prose prose-neutral dark:prose-invert"
              dangerouslySetInnerHTML={{
                __html: sanitizeArticleHtml(
                  entry.readabilityContent ||
                    (readability?.entryId === entry.id ? readability.content : "") ||
                    entry.content ||
                    entry.description ||
                    "<p>No content available.</p>",
                ),
              }}
            />
            {privateLocalReading && (
              <section className="remote-annotations">
                <h2>笔记与高亮</h2>
                <div className="remote-inline-form">
                  <RemoteInput value={noteText} onChange={setNoteText} placeholder="添加本地笔记" />
                  <button
                    className="remote-secondary-button"
                    disabled={!noteText.trim()}
                    onClick={() => void addNote()}
                  >
                    添加笔记
                  </button>
                </div>
                {annotations.notes.map((note) => (
                  <div className="remote-annotation-item" key={note.id}>
                    <span>{note.content}</span>
                    <button
                      className="remote-icon-button"
                      title="删除笔记"
                      onClick={() =>
                        void runtimeClient.annotations.deleteNote(note.id).then(async () => {
                          if (entryId) setAnnotations(await runtimeClient.annotations.list(entryId))
                        })
                      }
                    >
                      <i className="i-mgc-delete-2-cute-re" />
                    </button>
                  </div>
                ))}
                {annotations.highlights.map((highlight) => (
                  <blockquote
                    className={cn(
                      "remote-annotation-item",
                      highlight.status === "orphaned" && "is-orphaned",
                    )}
                    key={highlight.id}
                  >
                    {highlight.quote}
                    {highlight.status === "orphaned" && <small>需要重新定位</small>}
                  </blockquote>
                ))}
              </section>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function RemoteSubscriptionsOverlay({
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
  const [message, setMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState<
    Record<string, { title: string; category: string; view: FeedViewType }>
  >({})

  const selectedFeedIds = Array.from(selected)
  const run = async (task: () => Promise<void>, success: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await task()
      setMessage(success)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <OverlayFrame title="订阅管理" subtitle="不离开阅读界面即可管理订阅。" onClose={onClose}>
      <div className="remote-overlay-grid">
        <aside className="remote-overlay-side">
          <SectionTitle title="添加订阅" />
          <div className="remote-form-stack">
            <RemoteInput value={url} onChange={setUrl} placeholder="订阅源地址或 RSSHub 地址" />
            <RemoteInput value={title} onChange={setTitle} placeholder="标题（可选）" />
            <RemoteInput value={category} onChange={setCategory} placeholder="分类" />
            <RemoteViewSelect value={view} onChange={setView} />
            <div className="remote-two-buttons">
              <button
                className="remote-primary-button"
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
                  }, "订阅已添加")
                }
              >
                添加
              </button>
              <button
                className="remote-secondary-button"
                disabled={busy || !url.trim()}
                onClick={() =>
                  run(async () => {
                    await runtimeClient.feeds.preview({ url, allowPublicRsshub: true })
                  }, "预览成功")
                }
              >
                预览
              </button>
            </div>
          </div>

          <div className="remote-divider" />
          <SectionTitle title="批量" description={`${selectedFeedIds.length} selected`} />
          <div className="remote-form-stack">
            <RemoteInput value={batchCategory} onChange={setBatchCategory} placeholder="批量分类" />
            <RemoteViewSelect value={batchView} onChange={setBatchView} />
            <button
              className="remote-secondary-button"
              disabled={busy || selectedFeedIds.length === 0}
              onClick={() =>
                run(async () => {
                  await runtimeClient.subscriptions.batchUpdate({
                    feedIds: selectedFeedIds,
                    category: batchCategory || null,
                    view: batchView,
                  })
                }, "批量修改已应用")
              }
            >
              应用到所选
            </button>
            <button
              className="remote-danger-button"
              disabled={busy || selectedFeedIds.length === 0}
              onClick={() => {
                if (!window.confirm(`Delete ${selectedFeedIds.length} selected subscriptions?`)) {
                  return
                }
                void run(async () => {
                  await runtimeClient.subscriptions.deleteByTargets({ feedIds: selectedFeedIds })
                  setSelected(new Set())
                }, "已删除所选订阅")
              }}
            >
              删除所选
            </button>
            <button
              className="remote-secondary-button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (selectedFeedIds.length === 1)
                    await runtimeClient.feeds.refresh(selectedFeedIds[0]!)
                  else await runtimeClient.feeds.refresh()
                }, "已请求刷新")
              }
            >
              Refresh {selectedFeedIds.length === 1 ? "已选择" : "All"}
            </button>
          </div>
          {message && <div className="remote-inline-message">{message}</div>}
        </aside>

        <main className="remote-subscription-table">
          {subscriptions.map((subscription) => {
            const feedId = subscription.feedId!
            const draft = editing[feedId] ?? {
              title: subscription.title || "",
              category: subscription.category || "",
              view: subscription.view,
            }
            return (
              <div key={feedId} className="remote-subscription-row">
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
                <RemoteInput
                  value={draft.title}
                  onChange={(value) =>
                    setEditing((current) => ({
                      ...current,
                      [feedId]: { ...draft, title: value },
                    }))
                  }
                  placeholder="无标题"
                />
                <RemoteInput
                  value={draft.category}
                  onChange={(value) =>
                    setEditing((current) => ({
                      ...current,
                      [feedId]: { ...draft, category: value },
                    }))
                  }
                  placeholder="分类"
                />
                <RemoteViewSelect
                  value={draft.view}
                  onChange={(nextView) =>
                    setEditing((current) => ({
                      ...current,
                      [feedId]: { ...draft, view: nextView },
                    }))
                  }
                />
                <div className="remote-row-actions">
                  <button
                    className="remote-secondary-button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await runtimeClient.subscriptions.updateById(`feed/${feedId}`, {
                          title: draft.title || null,
                          category: draft.category || null,
                          view: draft.view,
                        })
                      }, "订阅已保存")
                    }
                  >
                    保存
                  </button>
                  <button
                    className="remote-danger-button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Delete ${draft.title || "this feed"}?`)) return
                      void run(async () => {
                        await runtimeClient.subscriptions.deleteByTargets({
                          ids: [`feed/${feedId}`],
                        })
                      }, "订阅已删除")
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </main>
      </div>
    </OverlayFrame>
  )
}

function RemoteSettingsOverlay({ onClose }: { onClose: () => void }) {
  const isMobile = useRemoteMobile()
  const [appearance, setAppearance] = useState<"light" | "dark" | "system">("system")
  const [rsshubCustomUrl, setRsshubCustomUrl] = useState("")
  const [exportText, setExportText] = useState("")
  const [importText, setImportText] = useState("")
  const [opmlText, setOpmlText] = useState("")
  const [opmlPreview, setOpmlPreview] = useState<
    Array<{
      index: number
      title: string | null
      url: string
      category: string | null
      duplicate: boolean
    }>
  >([])
  const [selectedOpmlIndexes, setSelectedOpmlIndexes] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void runtimeClient.settings.get().then((settings) => {
      setAppearance(settings.appearance)
      setRsshubCustomUrl(settings.rsshubCustomUrl)
    })
  }, [])

  const run = async (task: () => Promise<void>, success: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await task()
      setMessage(success)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <OverlayFrame
      title="设置"
      subtitle="可在浏览器端安全使用的设置与数据工具。"
      onClose={onClose}
      closable={!isMobile}
    >
      <div className="remote-settings-layout">
        <main className="remote-settings-main">
          <section>
            <SectionTitle title="外观" />
            <select
              className="remote-field remote-field-short"
              value={appearance}
              onChange={(event) => setAppearance(event.target.value as typeof appearance)}
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </section>

          <section>
            <SectionTitle title="RSSHub" />
            <div className="remote-inline-form">
              <RemoteInput
                value={rsshubCustomUrl}
                onChange={setRsshubCustomUrl}
                placeholder="https://rsshub.example.com"
              />
              <button
                className="remote-secondary-button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await runtimeClient.rsshub.precheck({
                      url: "rsshub://rsshub/routes",
                      allowPublicFallback: true,
                    })
                  }, "RSSHub 检测完成")
                }
              >
                检测
              </button>
            </div>
          </section>

          <section>
            <SectionTitle title="导入 / 导出" />
            <div className="remote-form-stack">
              <div className="remote-inline-form">
                <button
                  className="remote-secondary-button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const xml = await runtimeClient.opml.export()
                      const blob = new Blob([xml], { type: "text/x-opml" })
                      const url = URL.createObjectURL(blob)
                      const link = document.createElement("a")
                      link.href = url
                      link.download = "suhui.opml"
                      link.click()
                      URL.revokeObjectURL(url)
                    }, "OPML 导出已就绪")
                  }
                >
                  导出 OPML
                </button>
                <button
                  className="remote-secondary-button"
                  disabled={busy || !opmlText.trim()}
                  onClick={() =>
                    run(async () => {
                      const preview = (await runtimeClient.opml.preview(
                        opmlText,
                      )) as typeof opmlPreview
                      setOpmlPreview(preview)
                      setSelectedOpmlIndexes(
                        preview.filter((item) => !item.duplicate).map((item) => item.index),
                      )
                    }, "OPML 预览已就绪")
                  }
                >
                  预览 OPML
                </button>
                <button
                  className="remote-primary-button"
                  disabled={busy || selectedOpmlIndexes.length === 0}
                  onClick={() =>
                    run(async () => {
                      await runtimeClient.opml.import(opmlText, selectedOpmlIndexes)
                    }, "OPML 导入完成")
                  }
                >
                  导入所选
                </button>
              </div>
              <textarea
                className="remote-textarea"
                value={opmlText}
                onChange={(event) => {
                  setOpmlText(event.target.value)
                  setOpmlPreview([])
                  setSelectedOpmlIndexes([])
                }}
                placeholder="在此粘贴 OPML 以本地预览"
              />
              {opmlPreview.length > 0 ? (
                <div className="remote-form-stack">
                  {opmlPreview.map((item) => (
                    <label className="remote-annotation-item" key={`${item.index}:${item.url}`}>
                      <input
                        type="checkbox"
                        checked={selectedOpmlIndexes.includes(item.index)}
                        disabled={item.duplicate}
                        onChange={(event) =>
                          setSelectedOpmlIndexes((current) =>
                            event.target.checked
                              ? Array.from(new Set([...current, item.index]))
                              : current.filter((index) => index !== item.index),
                          )
                        }
                      />
                      <span>
                        {item.title || item.url}
                        {item.category ? ` · ${item.category}` : ""}
                        {item.duplicate ? " · already subscribed" : ""}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="remote-data-grid">
              <div className="remote-form-stack">
                <button
                  className="remote-secondary-button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const data = await runtimeClient.importExport.exportData()
                      const text = JSON.stringify(data, null, 2)
                      setExportText(text)
                      const blob = new Blob([text], { type: "application/json" })
                      const url = URL.createObjectURL(blob)
                      const link = document.createElement("a")
                      link.href = url
                      link.download = `suhui-export-${new Date().toISOString().slice(0, 10)}.json`
                      link.click()
                      URL.revokeObjectURL(url)
                    }, "导出已就绪")
                  }
                >
                  导出数据
                </button>
                <textarea className="remote-textarea" value={exportText} readOnly />
              </div>
              <div className="remote-form-stack">
                <button
                  className="remote-primary-button"
                  disabled={busy || !importText.trim()}
                  onClick={() =>
                    run(async () => {
                      const payload = parseRemoteImportPayload(importText)
                      await runtimeClient.importExport.importData(payload)
                    }, "导入完成")
                  }
                >
                  导入数据
                </button>
                <textarea
                  className="remote-textarea"
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="在此粘贴导出的 JSON"
                />
              </div>
            </div>
          </section>

          <div className="remote-settings-footer">
            <button
              className="remote-primary-button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await runtimeClient.settings.update({ appearance, rsshubCustomUrl })
                }, "设置已保存")
              }
            >
              保存设置
            </button>
            {message && <span className="remote-inline-status">{message}</span>}
          </div>
        </main>
      </div>
    </OverlayFrame>
  )
}

function OverlayFrame({
  title,
  subtitle,
  children,
  onClose,
  closable = true,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  onClose: () => void
  /** Off only where something else already leads out, i.e. the bottom tabs. */
  closable?: boolean
}) {
  return (
    <div className="remote-overlay-backdrop">
      <div className="remote-overlay-panel">
        <header className="remote-overlay-header">
          <div>
            <div className="remote-overlay-title">{title}</div>
            <div className="remote-overlay-subtitle">{subtitle}</div>
          </div>
          {closable && (
            <button className="remote-control-button" onClick={onClose}>
              <i className="i-mgc-close-cute-re" />
              关闭
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  )
}

function RemoteInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      className="remote-field"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  )
}

function RemoteViewSelect({
  value,
  onChange,
}: {
  value: FeedViewType
  onChange: (value: FeedViewType) => void
}) {
  return (
    <select
      className="remote-field"
      value={value}
      onChange={(event) => onChange(Number(event.target.value) as FeedViewType)}
    >
      {getViewList({ includeAll: false }).map((item) => (
        <option key={item.view} value={item.view}>
          {remoteViewLabelFor(item.view)}
        </option>
      ))}
    </select>
  )
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="remote-section-title">
      <div>{title}</div>
      {description && <span>{description}</span>}
    </div>
  )
}

function RemoteEmptyState({
  icon,
  title,
  description,
}: {
  icon: string
  title: string
  description: string
}) {
  return (
    <div className="remote-empty-state">
      <div className="remote-empty-icon">
        <i className={icon} />
      </div>
      <div className="remote-empty-title">{title}</div>
      <div className="remote-empty-description">{description}</div>
    </div>
  )
}

function RemotePaneSkeleton({ label, rows }: { label: string; rows: number }) {
  return (
    <div className="remote-pane-status" aria-live="polite">
      <div className="remote-pane-status-title">{label}</div>
      <div className="remote-skeleton-list" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div className="remote-skeleton-row" key={index} />
        ))}
      </div>
    </div>
  )
}

function RemotePaneError({
  action,
  description,
  onRetry,
  title,
}: {
  action: string
  description: string
  onRetry: () => void
  title: string
}) {
  return (
    <div className="remote-pane-status" role="alert">
      <div className="remote-pane-status-title">{title}</div>
      <div className="remote-pane-status-description">{description}</div>
      <button className="remote-secondary-button" onClick={onRetry}>
        {action}
      </button>
    </div>
  )
}

function IconButton({
  active,
  busy,
  disabled,
  icon,
  label,
  onClick,
}: {
  active?: boolean
  busy?: boolean
  disabled?: boolean
  icon: string
  label: string
  onClick: () => void | Promise<void>
}) {
  return (
    <button
      className={cn("remote-icon-button", active && "is-active")}
      disabled={disabled || busy}
      title={label}
      onClick={() => void onClick()}
    >
      <i className={cn(busy ? "i-mgc-loading-3-cute-re animate-spin" : icon)} />
    </button>
  )
}

function UnreadBadge({ count }: { count: number }) {
  return <span className="remote-unread-badge">{count > 99 ? "99+" : count}</span>
}
