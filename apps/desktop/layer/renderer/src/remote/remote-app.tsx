import { FeedViewType } from "@suhui/constants"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  type EntrySortMode,
  getPreferredEntryIdAfterReadChange,
  sortEntries,
} from "./entry-navigation"

type SubscriptionRecord = {
  id: string
  type?: string
  category?: string | null
  title?: string | null
  feedId?: string | null
  view?: number | null
}

type EntryRecord = {
  id: string
  title?: string | null
  feedId?: string | null
  read?: boolean | null
  publishedAt?: number | null
  content?: string | null
  readabilityContent?: string | null
  description?: string | null
  url?: string | null
  author?: string | null
  authorUrl?: string | null
}

type UnreadRecord = {
  id: string
  count: number
}

const VIEW_OPTIONS = [
  { value: FeedViewType.Articles, label: "Articles" },
  { value: FeedViewType.SocialMedia, label: "Social" },
  { value: FeedViewType.Pictures, label: "Pictures" },
  { value: FeedViewType.Videos, label: "Videos" },
  { value: FeedViewType.Audios, label: "Audios" },
  { value: FeedViewType.Notifications, label: "Notifications" },
]

const ENTRY_SORT_OPTIONS: Array<{ value: EntrySortMode; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "unread-first", label: "Unread First" },
]

const fetchJson = async <T,>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const RemoteApp = () => {
  const [status, setStatus] = useState("Connecting...")
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([])
  const [entries, setEntries] = useState<EntryRecord[]>([])
  const [unreads, setUnreads] = useState<Record<string, number>>({})
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [isHydrating, setIsHydrating] = useState(true)
  const [activeFeedId, setActiveFeedId] = useState<string | null>(null)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [activeEntry, setActiveEntry] = useState<EntryRecord | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [entrySort, setEntrySort] = useState<EntrySortMode>("newest")
  const [refreshingFeed, setRefreshingFeed] = useState(false)
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [mutatingEntryId, setMutatingEntryId] = useState<string | null>(null)
  const [creatingSubscription, setCreatingSubscription] = useState(false)
  const [savingSubscription, setSavingSubscription] = useState(false)
  const [deletingSubscriptionId, setDeletingSubscriptionId] = useState<string | null>(null)
  const [newFeedUrl, setNewFeedUrl] = useState("")
  const [newFeedTitle, setNewFeedTitle] = useState("")
  const [newFeedCategory, setNewFeedCategory] = useState("")
  const [newFeedView, setNewFeedView] = useState<number>(FeedViewType.Articles)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftCategory, setDraftCategory] = useState("")
  const [draftView, setDraftView] = useState<number>(FeedViewType.Articles)
  const hadRealtimeConnectionRef = useRef(false)

  const activeSubscription = useMemo(
    () => subscriptions.find((item) => item.feedId === activeFeedId) || null,
    [activeFeedId, subscriptions],
  )

  const activeSubscriptionTitle = useMemo(
    () => activeSubscription?.title || "Entries",
    [activeSubscription],
  )

  const sortedEntries = useMemo(() => sortEntries(entries, entrySort), [entries, entrySort])

  const contextSummary = useMemo(() => {
    const items = [
      activeSubscription?.title || "All sources",
      unreadOnly ? "Unread only" : "All entries",
      ENTRY_SORT_OPTIONS.find((option) => option.value === entrySort)?.label || "Newest",
      `${sortedEntries.length} entries`,
    ]
    return items.join(" · ")
  }, [activeSubscription?.title, unreadOnly, entrySort, sortedEntries.length])

  const activeEntryIndex = useMemo(
    () => sortedEntries.findIndex((item) => item.id === activeEntryId),
    [activeEntryId, sortedEntries],
  )

  const previousEntry = activeEntryIndex > 0 ? sortedEntries[activeEntryIndex - 1] : null
  const nextEntry =
    activeEntryIndex >= 0 && activeEntryIndex < sortedEntries.length - 1
      ? sortedEntries[activeEntryIndex + 1]
      : null

  useEffect(() => {
    setDraftTitle(activeSubscription?.title || "")
    setDraftCategory(activeSubscription?.category || "")
    setDraftView(activeSubscription?.view ?? FeedViewType.Articles)
  }, [activeSubscription])

  const markSynced = (nextStatus = "Connected · Realtime online") => {
    setRealtimeConnected(true)
    hadRealtimeConnectionRef.current = true
    setLastSyncAt(new Date().toLocaleTimeString())
    setStatus(nextStatus)
  }

  const loadSubscriptions = async (options?: { silent?: boolean; statusText?: string }) => {
    if (!options?.silent) {
      setStatus(options?.statusText || "Loading subscriptions...")
    }
    const [subscriptionPayload, unreadPayload] = await Promise.all([
      fetchJson<{ data: SubscriptionRecord[] }>("/api/subscriptions"),
      fetchJson<{ data: UnreadRecord[] }>("/api/unread"),
    ])

    const nextSubscriptions = subscriptionPayload.data || []
    const nextUnreads = Object.fromEntries(
      (unreadPayload.data || []).map((item) => [item.id, item.count]),
    )

    setSubscriptions(nextSubscriptions)
    setUnreads(nextUnreads)
    setActiveFeedId((current) => {
      if (current && nextSubscriptions.some((item) => item.feedId === current)) {
        return current
      }
      return nextSubscriptions.find((item) => item.feedId)?.feedId || null
    })
    setLastSyncAt(new Date().toLocaleTimeString())
    setIsHydrating(false)
    if (!options?.silent) {
      setStatus(realtimeConnected ? "Connected · Initial sync complete" : "Connected · Data synced")
    }
  }

  const loadEntries = async (
    feedId: string,
    nextUnreadOnly = unreadOnly,
    options?: { preserveSelection?: boolean },
  ) => {
    const searchParams = new URLSearchParams({
      feedId,
    })
    if (nextUnreadOnly) {
      searchParams.set("unreadOnly", "1")
    }
    const payload = await fetchJson<{ data: EntryRecord[] }>(
      `/api/entries?${searchParams.toString()}`,
    )
    const nextEntries = payload.data || []
    setEntries(nextEntries)
    setActiveEntryId((current) => {
      if (
        options?.preserveSelection &&
        current &&
        nextEntries.some((item) => item.id === current)
      ) {
        return current
      }
      if (current && nextEntries.some((item) => item.id === current)) {
        return current
      }
      return nextEntries[0]?.id || null
    })
  }

  const loadEntry = async (entryId: string) => {
    const payload = await fetchJson<{ data: EntryRecord | null }>(
      `/api/entries/${encodeURIComponent(entryId)}`,
    )
    setActiveEntry(payload.data || null)
  }

  useEffect(() => {
    void loadSubscriptions({ statusText: "Loading subscriptions..." }).catch((error) => {
      setIsHydrating(false)
      setRealtimeConnected(false)
      setStatus("Disconnected")
      console.error("[remote-app] failed to load subscriptions", error)
    })
  }, [])

  useEffect(() => {
    if (!activeFeedId) {
      setEntries([])
      setActiveEntryId(null)
      setActiveEntry(null)
      return
    }

    void loadEntries(activeFeedId, unreadOnly, { preserveSelection: true }).catch((error) => {
      console.error("[remote-app] failed to load entries", error)
    })
  }, [activeFeedId, unreadOnly])

  useEffect(() => {
    if (!activeEntryId) {
      setActiveEntry(null)
      return
    }

    void loadEntry(activeEntryId).catch((error) => {
      console.error("[remote-app] failed to load entry detail", error)
    })
  }, [activeEntryId])

  useEffect(() => {
    const eventSource = new EventSource("/events")

    eventSource.addEventListener("ready", () => {
      const shouldResync = hadRealtimeConnectionRef.current
      markSynced("Connected · Realtime online")
      if (shouldResync) {
        void loadSubscriptions({ silent: true }).catch((error) => {
          console.error("[remote-app] failed to resync subscriptions", error)
        })
        if (activeFeedId) {
          void loadEntries(activeFeedId, unreadOnly, { preserveSelection: true }).catch((error) => {
            console.error("[remote-app] failed to resync entries", error)
          })
        }
      }
    })
    eventSource.addEventListener("ping", () => {
      markSynced("Connected · Realtime online")
    })
    eventSource.addEventListener("subscriptions.updated", () => {
      void loadSubscriptions({ silent: true }).catch((error) => {
        console.error("[remote-app] failed to reload subscriptions", error)
      })
    })
    eventSource.addEventListener("entries.updated", (event) => {
      if (!activeFeedId) return
      const payload = JSON.parse(event.data || "{}") as { feedId?: string }
      if (payload.feedId && payload.feedId !== activeFeedId) return
      void loadEntries(activeFeedId, unreadOnly, { preserveSelection: true }).catch((error) => {
        console.error("[remote-app] failed to reload entries", error)
      })
    })
    eventSource.onerror = () => {
      setRealtimeConnected(false)
      setStatus("Disconnected")
    }

    return () => {
      eventSource.close()
    }
  }, [activeFeedId, unreadOnly])

  const handleUpdateReadStatus = async (entryId: string, read: boolean) => {
    setMutatingEntryId(entryId)
    const preferredNextEntryId = getPreferredEntryIdAfterReadChange({
      entries: sortedEntries,
      activeEntryId,
      changedEntryId: entryId,
      nextRead: read,
      unreadOnly,
    })

    try {
      await fetchJson<{ ok: true }>("/api/entries/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryIds: [entryId], read }),
      })
      await loadSubscriptions({ silent: true })
      if (activeFeedId) {
        await loadEntries(activeFeedId, unreadOnly, { preserveSelection: true })
      }
      if (preferredNextEntryId !== undefined) {
        setActiveEntryId(preferredNextEntryId)
      }
    } catch (error) {
      console.error("[remote-app] failed to update read state", error)
    } finally {
      setMutatingEntryId(null)
    }
  }

  const handleCreateSubscription = async () => {
    if (!newFeedUrl.trim()) return
    setCreatingSubscription(true)
    setStatus("Creating subscription...")
    try {
      await fetchJson("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newFeedUrl.trim(),
          view: newFeedView,
          category: newFeedCategory.trim() || undefined,
          title: newFeedTitle.trim() || undefined,
        }),
      })
      setNewFeedUrl("")
      setNewFeedTitle("")
      setNewFeedCategory("")
      setNewFeedView(FeedViewType.Articles)
      await loadSubscriptions({ silent: true })
      setStatus("Connected · Subscription created")
    } catch (error) {
      setStatus("Connected · Create failed")
      console.error("[remote-app] failed to create subscription", error)
    } finally {
      setCreatingSubscription(false)
    }
  }

  const handleSaveSubscription = async () => {
    if (!activeSubscription?.id) return
    setSavingSubscription(true)
    setStatus("Saving subscription...")
    try {
      await fetchJson(`/api/subscriptions/${encodeURIComponent(activeSubscription.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle.trim() || null,
          category: draftCategory.trim() || null,
          view: draftView,
        }),
      })
      await loadSubscriptions({ silent: true })
      setStatus("Connected · Subscription saved")
    } catch (error) {
      setStatus("Connected · Save failed")
      console.error("[remote-app] failed to save subscription", error)
    } finally {
      setSavingSubscription(false)
    }
  }

  const handleDeleteSubscription = async (subscriptionId: string) => {
    setDeletingSubscriptionId(subscriptionId)
    setStatus("Deleting subscription...")
    try {
      await fetchJson(`/api/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: "DELETE",
      })
      await loadSubscriptions({ silent: true })
      setStatus("Connected · Subscription deleted")
    } catch (error) {
      setStatus("Connected · Delete failed")
      console.error("[remote-app] failed to delete subscription", error)
    } finally {
      setDeletingSubscriptionId(null)
    }
  }

  const handleRefreshFeed = async () => {
    if (!activeFeedId) return
    setRefreshingFeed(true)
    setStatus("Refreshing...")
    try {
      await fetchJson(`/api/feeds/${encodeURIComponent(activeFeedId)}/refresh`, {
        method: "POST",
      })
      await loadSubscriptions({ silent: true })
      await loadEntries(activeFeedId, unreadOnly, { preserveSelection: true })
      setStatus("Connected · Refresh complete")
    } catch (error) {
      setStatus("Connected · Refresh failed")
      console.error("[remote-app] failed to refresh feed", error)
    } finally {
      setRefreshingFeed(false)
    }
  }

  const handleRefreshAll = async () => {
    setRefreshingAll(true)
    setStatus("Refreshing all feeds...")
    try {
      await fetchJson("/api/feeds/refresh-all", {
        method: "POST",
      })
      await loadSubscriptions({ silent: true })
      if (activeFeedId) {
        await loadEntries(activeFeedId, unreadOnly, { preserveSelection: true })
      }
      setStatus("Connected · Refresh all complete")
    } catch (error) {
      setStatus("Connected · Refresh all failed")
      console.error("[remote-app] failed to refresh all feeds", error)
    } finally {
      setRefreshingAll(false)
    }
  }

  return (
    <div className="remote-page">
      <header className="remote-hero">
        <div>
          <p className="remote-eyebrow">LAN Remote</p>
          <h1 className="remote-title">Suhui Remote</h1>
          <p className="remote-subtitle">Browser access backed by the running desktop app.</p>
        </div>
        <div className="remote-status">{status}</div>
      </header>

      <section className="remote-context-bar">
        <span className="remote-context-chip">{contextSummary}</span>
        <span
          className={realtimeConnected ? "remote-context-chip" : "remote-context-chip is-offline"}
        >
          {realtimeConnected ? "Realtime Online" : "Realtime Disconnected"}
        </span>
        {lastSyncAt && <span className="remote-context-chip">Last sync {lastSyncAt}</span>}
      </section>

      {!realtimeConnected && !isHydrating && (
        <section className="remote-banner">
          <p className="remote-banner-text">
            Connection lost. Reading state is preserved. Realtime updates will resume after
            reconnection.
          </p>
          <button
            className="remote-button"
            onClick={() => {
              void loadSubscriptions({ statusText: "Reconnecting..." }).catch((error) => {
                setRealtimeConnected(false)
                setStatus("Disconnected")
                console.error("[remote-app] failed to reconnect subscriptions", error)
              })
              if (activeFeedId) {
                void loadEntries(activeFeedId, unreadOnly, { preserveSelection: true }).catch(
                  (error) => {
                    console.error("[remote-app] failed to reconnect entries", error)
                  },
                )
              }
            }}
          >
            Retry Sync
          </button>
        </section>
      )}

      <main className="remote-shell">
        <section className="remote-pane remote-pane--subscriptions">
          <div className="remote-pane-header">
            <div>
              <p className="remote-section-label">Subscriptions</p>
              <h2 className="remote-section-title">Sources</h2>
            </div>
            <div className="remote-actions">
              <button
                className={unreadOnly ? "remote-button" : "remote-button remote-button--secondary"}
                onClick={() => {
                  setUnreadOnly((current) => !current)
                }}
              >
                {unreadOnly ? "Unread Only On" : "Unread Only Off"}
              </button>
              <button
                className="remote-button remote-button--secondary"
                disabled={refreshingAll}
                onClick={() => {
                  void handleRefreshAll()
                }}
              >
                {refreshingAll ? "Refreshing..." : "Refresh All"}
              </button>
              <button
                className="remote-button"
                disabled={!activeFeedId || refreshingFeed}
                onClick={() => {
                  void handleRefreshFeed()
                }}
              >
                {refreshingFeed ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="remote-create-form">
            <input
              className="remote-input"
              placeholder="Feed URL"
              value={newFeedUrl}
              onChange={(event) => {
                setNewFeedUrl(event.target.value)
              }}
            />
            <input
              className="remote-input"
              placeholder="Custom title"
              value={newFeedTitle}
              onChange={(event) => {
                setNewFeedTitle(event.target.value)
              }}
            />
            <input
              className="remote-input"
              placeholder="Category"
              value={newFeedCategory}
              onChange={(event) => {
                setNewFeedCategory(event.target.value)
              }}
            />
            <select
              className="remote-input"
              value={newFeedView}
              onChange={(event) => {
                setNewFeedView(Number(event.target.value))
              }}
            >
              {VIEW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="remote-button"
              disabled={creatingSubscription || !newFeedUrl.trim()}
              onClick={() => {
                void handleCreateSubscription()
              }}
            >
              {creatingSubscription ? "Adding..." : "Add Feed"}
            </button>
          </div>

          <div className="remote-list">
            {subscriptions.length === 0 ? (
              <p className="remote-empty">No subscriptions yet.</p>
            ) : (
              subscriptions.map((item) => {
                const unread = item.feedId ? unreads[item.feedId] || 0 : 0
                const active = item.feedId === activeFeedId
                return (
                  <article
                    key={item.id}
                    className={active ? "remote-card is-active" : "remote-card"}
                  >
                    <button
                      className="remote-card-button"
                      disabled={!item.feedId}
                      onClick={() => {
                        if (item.feedId) {
                          setActiveFeedId(item.feedId)
                        }
                      }}
                    >
                      <span className="remote-card-title">{item.title || item.id}</span>
                      <span className="remote-card-meta">
                        {[
                          item.type,
                          item.category,
                          item.feedId,
                          VIEW_OPTIONS.find((option) => option.value === item.view)?.label,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {unread > 0 && <span className="remote-badge">{unread} unread</span>}
                    </button>
                    <div className="remote-inline-actions">
                      <button
                        className="remote-inline-action"
                        disabled={deletingSubscriptionId === item.id}
                        onClick={() => {
                          void handleDeleteSubscription(item.id)
                        }}
                      >
                        {deletingSubscriptionId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>

          <div className="remote-editor">
            <div className="remote-pane-header remote-pane-header--stack">
              <div>
                <p className="remote-section-label">Manage</p>
                <h3 className="remote-section-title remote-section-title--small">
                  {activeSubscription
                    ? activeSubscription.title || activeSubscription.id
                    : "Select a source"}
                </h3>
              </div>
            </div>

            {!activeSubscription ? (
              <p className="remote-empty">Choose a subscription to edit it.</p>
            ) : (
              <div className="remote-create-form">
                <input
                  className="remote-input"
                  placeholder="Title"
                  value={draftTitle}
                  onChange={(event) => {
                    setDraftTitle(event.target.value)
                  }}
                />
                <input
                  className="remote-input"
                  placeholder="Category"
                  value={draftCategory}
                  onChange={(event) => {
                    setDraftCategory(event.target.value)
                  }}
                />
                <select
                  className="remote-input"
                  value={draftView}
                  onChange={(event) => {
                    setDraftView(Number(event.target.value))
                  }}
                >
                  {VIEW_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  className="remote-button"
                  disabled={savingSubscription}
                  onClick={() => {
                    void handleSaveSubscription()
                  }}
                >
                  {savingSubscription ? "Saving..." : "Save Changes"}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="remote-pane remote-pane--entries">
          <div className="remote-pane-header">
            <div>
              <p className="remote-section-label">Entries</p>
              <h2 className="remote-section-title">{activeSubscriptionTitle}</h2>
            </div>
            <div className="remote-actions">
              <select
                className="remote-input remote-input--compact"
                value={entrySort}
                onChange={(event) => {
                  setEntrySort(event.target.value as EntrySortMode)
                }}
              >
                {ENTRY_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="remote-context-chip">
                {unreadOnly ? "Unread only" : "All entries"} · {sortedEntries.length}
              </span>
              <button
                className="remote-button remote-button--secondary"
                disabled={!previousEntry}
                onClick={() => {
                  if (previousEntry) {
                    setActiveEntryId(previousEntry.id)
                  }
                }}
              >
                Prev
              </button>
              <button
                className="remote-button remote-button--secondary"
                disabled={!nextEntry}
                onClick={() => {
                  if (nextEntry) {
                    setActiveEntryId(nextEntry.id)
                  }
                }}
              >
                Next
              </button>
            </div>
          </div>

          <div className="remote-list">
            {!activeFeedId ? (
              <p className="remote-empty">Choose a subscription.</p>
            ) : sortedEntries.length === 0 ? (
              <p className="remote-empty">No entries for this subscription yet.</p>
            ) : (
              sortedEntries.map((item) => (
                <article
                  key={item.id}
                  className={
                    activeEntryId === item.id
                      ? "remote-card remote-card--entry is-active"
                      : "remote-card remote-card--entry"
                  }
                  onClick={() => {
                    setActiveEntryId(item.id)
                  }}
                >
                  <div>
                    <h3 className="remote-card-title">{item.title || item.id}</h3>
                    <p className="remote-card-meta">
                      {item.publishedAt
                        ? new Date(item.publishedAt).toLocaleString()
                        : "Unknown time"}
                    </p>
                    {item.author && <p className="remote-card-meta">By {item.author}</p>}
                    <p className="remote-card-meta">{item.read ? "Read" : "Unread"}</p>
                  </div>
                  <div className="remote-actions">
                    <button
                      className="remote-button"
                      disabled={!!item.read || mutatingEntryId === item.id}
                      onClick={() => {
                        setActiveEntryId(item.id)
                        void handleUpdateReadStatus(item.id, true)
                      }}
                    >
                      {item.read ? "Read" : mutatingEntryId === item.id ? "Saving..." : "Mark Read"}
                    </button>
                    <button
                      className="remote-button remote-button--secondary"
                      disabled={!item.read || mutatingEntryId === item.id}
                      onClick={() => {
                        setActiveEntryId(item.id)
                        void handleUpdateReadStatus(item.id, false)
                      }}
                    >
                      {mutatingEntryId === item.id && item.read ? "Saving..." : "Mark Unread"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          {activeEntry && (
            <article className="remote-detail">
              <p className="remote-section-label">Detail</p>
              <h3 className="remote-detail-title">{activeEntry.title || activeEntry.id}</h3>
              <div className="remote-detail-meta">
                <p className="remote-detail-description">
                  {activeEntry.publishedAt
                    ? new Date(activeEntry.publishedAt).toLocaleString()
                    : "Unknown publish time"}
                </p>
                {activeEntry.author && (
                  <p className="remote-detail-description">
                    By{" "}
                    {activeEntry.authorUrl ? (
                      <a
                        className="remote-link"
                        href={activeEntry.authorUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {activeEntry.author}
                      </a>
                    ) : (
                      activeEntry.author
                    )}
                  </p>
                )}
                {activeEntry.url && (
                  <p className="remote-detail-description">
                    <a
                      className="remote-link"
                      href={activeEntry.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open Original
                    </a>
                  </p>
                )}
              </div>
              {activeEntry.description && (
                <p className="remote-detail-description">{activeEntry.description}</p>
              )}
              <div className="remote-actions remote-detail-actions">
                <button
                  className="remote-button"
                  disabled={!!activeEntry.read || mutatingEntryId === activeEntry.id}
                  onClick={() => {
                    void handleUpdateReadStatus(activeEntry.id, true)
                  }}
                >
                  {activeEntry.read
                    ? "Read"
                    : mutatingEntryId === activeEntry.id
                      ? "Saving..."
                      : "Mark Read"}
                </button>
                <button
                  className="remote-button remote-button--secondary"
                  disabled={!activeEntry.read || mutatingEntryId === activeEntry.id}
                  onClick={() => {
                    void handleUpdateReadStatus(activeEntry.id, false)
                  }}
                >
                  {mutatingEntryId === activeEntry.id && activeEntry.read
                    ? "Saving..."
                    : "Mark Unread"}
                </button>
                <button
                  className="remote-button remote-button--secondary"
                  disabled={!previousEntry}
                  onClick={() => {
                    if (previousEntry) {
                      setActiveEntryId(previousEntry.id)
                    }
                  }}
                >
                  Prev
                </button>
                <button
                  className="remote-button remote-button--secondary"
                  disabled={!nextEntry}
                  onClick={() => {
                    if (nextEntry) {
                      setActiveEntryId(nextEntry.id)
                    }
                  }}
                >
                  Next
                </button>
              </div>
              <div
                className="remote-detail-content"
                dangerouslySetInnerHTML={{
                  __html:
                    activeEntry.readabilityContent ||
                    activeEntry.content ||
                    "<p>No readable content yet.</p>",
                }}
              />
            </article>
          )}
        </section>
      </main>
    </div>
  )
}
