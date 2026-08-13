/**
 * Desktop-shaped remote reader.
 *
 * This entry is still browser-safe: all writes go through runtimeClient and the
 * Electron main-hosted HTTP adapter. It intentionally avoids passive read-state
 * writes so opening the Web client cannot consume unread articles.
 */

import { useMobile } from "@suhui/components/hooks/useMobile.js"
import { FeedViewType, getViewList } from "@suhui/constants"
import { useIsEntryStarred } from "@suhui/store/collection/hooks"
import { collectionActions, useCollectionStore } from "@suhui/store/collection/store"
import { getEntry } from "@suhui/store/entry/getter"
import { useEntry, useEntriesQuery } from "@suhui/store/entry/hooks"
import { entrySyncServices } from "@suhui/store/entry/store"
import { useFeedById } from "@suhui/store/feed/hooks"
import { runtimeClient } from "@suhui/store/runtime"
import { useSubscriptionStore } from "@suhui/store/subscription/store"
import { unreadSyncService, useUnreadStore } from "@suhui/store/unread/store"
import { cn } from "@suhui/utils/utils"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react"

import {
  useRemoteBootstrap,
  useRemoteConnection,
  type RemoteBootstrapViewState,
  type RemoteConnectionPhase,
} from "./remote-bootstrap"
import { markRemoteDataReadyIfComplete, markRemoteMetric } from "./remote-performance"

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
  type RemoteFeedGroup,
  type RemoteFeedSummary,
} from "./remote-view-model"

type Pane = "feeds" | "entries" | "content"
type Overlay = "subscriptions" | "settings" | null

const layoutContract = getRemoteDesktopLayoutContract()

export function RemoteApp() {
  const isMobile = useMobile()
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
    () => feedList.find((feed) => feed.feedId === activeFeedId)?.title || "All Feeds",
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

  return (
    <div
      className={layoutContract.root}
      data-remote-layout="desktop-reader"
      data-testid="remote-reader-shell"
    >
      {isMobile && (
        <MobilePaneSwitcher
          activePane={mobilePane}
          activeTitle={
            mobilePane === "feeds"
              ? remoteViewLabelFor(activeView)
              : mobilePane === "entries"
                ? activeFeedTitle
                : "Article"
          }
          canOpenContent={!!activeEntryId}
          onChange={setMobilePane}
        />
      )}

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
    </div>
  )
}

function MobilePaneSwitcher({
  activePane,
  activeTitle,
  canOpenContent,
  onChange,
}: {
  activePane: Pane
  activeTitle: string
  canOpenContent: boolean
  onChange: (pane: Pane) => void
}) {
  return (
    <header className="remote-mobile-switcher">
      <div className="remote-mobile-title">{activeTitle}</div>
      <div className="remote-mobile-segments">
        {(["feeds", "entries", "content"] as const).map((pane) => (
          <button
            key={pane}
            className={cn("remote-mobile-segment", activePane === pane && "is-active")}
            disabled={pane === "content" && !canOpenContent}
            onClick={() => onChange(pane)}
          >
            {pane === "feeds" ? "Feeds" : pane === "entries" ? "List" : "Read"}
          </button>
        ))}
      </div>
    </header>
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
            <div className="remote-app-title">Suhui</div>
            <div className="remote-connection" data-connection-phase={connectionPhase}>
              <span className={cn("remote-connection-dot", `is-${connectionPhase}`)} />
              {connectionPhase === "connected"
                ? "Remote connected"
                : connectionPhase === "connecting"
                  ? "Remote connecting"
                  : "Remote disconnected"}
            </div>
          </div>
        </div>
        <div className="remote-sidebar-actions">
          <IconButton icon="i-mgc-settings-3-cute-re" label="Settings" onClick={onOpenSettings} />
          <IconButton
            icon="i-mgc-add-cute-re"
            label="Subscriptions"
            onClick={onOpenSubscriptions}
          />
        </div>
      </div>

      <nav className="remote-view-tabs" aria-label="Timeline views">
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
          <span className="remote-source-title">All Feeds</span>
          {totalUnread > 0 && <UnreadBadge count={totalUnread} />}
        </button>
      )}

      <div className="remote-source-scroll">
        {bootstrap.phase === "loading" ? (
          <RemotePaneSkeleton label="Loading subscriptions" rows={7} />
        ) : bootstrap.phase === "error" ? (
          <RemotePaneError
            action="Retry metadata"
            description={bootstrap.error || "The desktop host did not return metadata."}
            onRetry={bootstrap.retry}
            title="Subscriptions unavailable"
          />
        ) : feedGroups.length === 0 ? (
          <RemoteEmptyState
            icon="i-mgc-rss-cute-fi"
            title="No subscriptions"
            description="Add feeds from the subscription panel."
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
      <span className="remote-source-title">{feed.title || "Untitled"}</span>
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
            label={activeFeedId ? "Refresh feed" : "Refresh all"}
            onClick={runRefresh}
          />
          <IconButton
            icon="i-mgc-more-2-cute-re"
            label="Subscriptions"
            onClick={onOpenSubscriptions}
          />
        </div>
      </header>

      <div className="remote-entry-scroll">
        {bootstrapPhase === "error" ? (
          <RemoteEmptyState
            icon="i-mgc-information-cute-re"
            title="Entries waiting for subscriptions"
            description="Retry metadata from the subscriptions pane."
          />
        ) : bootstrapPhase === "loading" || entriesQuery.isLoading ? (
          <RemotePaneSkeleton label="Loading entries" rows={6} />
        ) : entriesQuery.isError ? (
          <RemotePaneError
            action="Retry entries"
            description="The entry page could not be loaded. Your subscriptions remain available."
            onRetry={() => void entriesQuery.refetch()}
            title="Entries unavailable"
          />
        ) : !activeFeedId && activeFeedIdsForView.length === 0 ? (
          <RemoteEmptyState
            icon="i-mgc-rss-cute-fi"
            title="No feeds in this view"
            description="Choose another view or add a subscription."
          />
        ) : entryIds.length === 0 ? (
          <RemoteEmptyState
            icon="i-mgc-docment-cute-re"
            title={unreadOnly ? "No unread entries" : "No entries"}
            description="Refresh feeds or choose another subscription."
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
        if (event.key !== "Enter" && event.key !== " ") return
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
          {entry.title || "Untitled"}
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
      title={isStarred ? "Unstar" : "Star"}
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

  const addToQueue = async () => {
    if (!entryId) return
    setQueueBusy(true)
    setActionError(null)
    try {
      await runtimeClient.readingQueue.add(entryId)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update reading queue")
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
      setActionError(error instanceof Error ? error.message : "Unable to save note")
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
      setActionError(error instanceof Error ? error.message : "PDF export failed")
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
          <div className="remote-reader-title">{entry?.title || "Select an entry"}</div>
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
              title="Open original"
            >
              <i className="i-mgc-external-link-cute-re" />
            </a>
          )}
          <IconButton
            disabled={!entryId}
            icon="i-mgc-check-circle-cute-re"
            label={entry?.read ? "Mark unread" : "Mark read"}
            onClick={toggleRead}
          />
          {privateLocalReading && (
            <IconButton
              busy={queueBusy}
              disabled={!entryId}
              icon="i-mgc-time-cute-re"
              label="Read later"
              onClick={addToQueue}
            />
          )}
          <IconButton
            busy={pdfBusy}
            disabled={!entryId}
            icon="i-mgc-download-2-cute-re"
            label="Export PDF"
            onClick={exportPdf}
          />
        </div>
      </header>

      {!entryId || !entry ? (
        <RemoteEmptyState
          icon="i-mgc-docment-cute-re"
          title="Select an entry"
          description="Choose an item from the timeline to read it here."
        />
      ) : (
        <div className="remote-reader-scroll">
          <div className="remote-article-shell">
            <h1 className="remote-article-title">{entry.title || "Untitled"}</h1>
            <div className="remote-article-meta">
              {feed?.title && <span>{feed.title}</span>}
              {entry.author && <span>{entry.author}</span>}
              {entry.publishedAt && <span>{new Date(entry.publishedAt).toLocaleString()}</span>}
            </div>
            {actionError && <div className="remote-action-error">{actionError}</div>}
            <div
              className="remote-entry-content prose prose-neutral dark:prose-invert"
              dangerouslySetInnerHTML={{
                __html:
                  entry.readabilityContent ||
                  entry.content ||
                  entry.description ||
                  "<p>No content available.</p>",
              }}
            />
            {privateLocalReading && (
              <section className="remote-annotations">
                <h2>Notes & Highlights</h2>
                <div className="remote-inline-form">
                  <RemoteInput
                    value={noteText}
                    onChange={setNoteText}
                    placeholder="Add a local note"
                  />
                  <button
                    className="remote-secondary-button"
                    disabled={!noteText.trim()}
                    onClick={() => void addNote()}
                  >
                    Add note
                  </button>
                </div>
                {annotations.notes.map((note) => (
                  <div className="remote-annotation-item" key={note.id}>
                    <span>{note.content}</span>
                    <button
                      className="remote-icon-button"
                      title="Delete note"
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
                    {highlight.status === "orphaned" && <small>Needs relocation</small>}
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
      setMessage(error instanceof Error ? error.message : "Action failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <OverlayFrame
      title="Subscriptions"
      subtitle="Manage feeds without leaving the reader."
      onClose={onClose}
    >
      <div className="remote-overlay-grid">
        <aside className="remote-overlay-side">
          <SectionTitle title="Add Feed" />
          <div className="remote-form-stack">
            <RemoteInput value={url} onChange={setUrl} placeholder="Feed URL or RSSHub URL" />
            <RemoteInput value={title} onChange={setTitle} placeholder="Title (optional)" />
            <RemoteInput value={category} onChange={setCategory} placeholder="Category" />
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
                  }, "Feed added")
                }
              >
                Add
              </button>
              <button
                className="remote-secondary-button"
                disabled={busy || !url.trim()}
                onClick={() =>
                  run(async () => {
                    await runtimeClient.feeds.preview({ url, allowPublicRsshub: true })
                  }, "Preview succeeded")
                }
              >
                Preview
              </button>
            </div>
          </div>

          <div className="remote-divider" />
          <SectionTitle title="Batch" description={`${selectedFeedIds.length} selected`} />
          <div className="remote-form-stack">
            <RemoteInput
              value={batchCategory}
              onChange={setBatchCategory}
              placeholder="Batch category"
            />
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
                }, "Batch update applied")
              }
            >
              Apply to Selected
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
                }, "Selected feeds removed")
              }}
            >
              Delete Selected
            </button>
            <button
              className="remote-secondary-button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (selectedFeedIds.length === 1)
                    await runtimeClient.feeds.refresh(selectedFeedIds[0]!)
                  else await runtimeClient.feeds.refresh()
                }, "Refresh requested")
              }
            >
              Refresh {selectedFeedIds.length === 1 ? "Selected" : "All"}
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
                  placeholder="Untitled"
                />
                <RemoteInput
                  value={draft.category}
                  onChange={(value) =>
                    setEditing((current) => ({
                      ...current,
                      [feedId]: { ...draft, category: value },
                    }))
                  }
                  placeholder="Category"
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
                      }, "Feed saved")
                    }
                  >
                    Save
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
                      }, "Feed removed")
                    }}
                  >
                    Delete
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
      setMessage(error instanceof Error ? error.message : "Action failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <OverlayFrame title="Settings" subtitle="Web-safe settings and data tools." onClose={onClose}>
      <div className="remote-settings-layout">
        <aside className="remote-settings-nav">
          <div className="is-active">General</div>
          <div>RSSHub</div>
          <div>Import / Export</div>
        </aside>
        <main className="remote-settings-main">
          <section>
            <SectionTitle title="Appearance" />
            <select
              className="remote-field remote-field-short"
              value={appearance}
              onChange={(event) => setAppearance(event.target.value as typeof appearance)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
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
                  }, "RSSHub precheck completed")
                }
              >
                Precheck
              </button>
            </div>
          </section>

          <section>
            <SectionTitle title="Import / Export" />
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
                    }, "OPML export prepared")
                  }
                >
                  Export OPML
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
                    }, "OPML preview ready")
                  }
                >
                  Preview OPML
                </button>
                <button
                  className="remote-primary-button"
                  disabled={busy || selectedOpmlIndexes.length === 0}
                  onClick={() =>
                    run(async () => {
                      await runtimeClient.opml.import(opmlText, selectedOpmlIndexes)
                    }, "OPML import completed")
                  }
                >
                  Import selected
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
                placeholder="Paste OPML here for a local preview"
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
                    }, "Export prepared")
                  }
                >
                  Export Data
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
                    }, "Import completed")
                  }
                >
                  Import Data
                </button>
                <textarea
                  className="remote-textarea"
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="Paste exported JSON here"
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
                }, "Settings saved")
              }
            >
              Save Settings
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
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="remote-overlay-backdrop">
      <div className="remote-overlay-panel">
        <header className="remote-overlay-header">
          <div>
            <div className="remote-overlay-title">{title}</div>
            <div className="remote-overlay-subtitle">{subtitle}</div>
          </div>
          <button className="remote-control-button" onClick={onClose}>
            <i className="i-mgc-close-cute-re" />
            Close
          </button>
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
