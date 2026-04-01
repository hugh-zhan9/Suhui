/**
 * 远程端应用
 * 复用桌面端的 store hooks 和样式系统
 */

import { cn } from "@suhui/utils/utils"
import { useEffect, useMemo, useState } from "react"

import { useEntry } from "@suhui/store/entry/hooks"
import { useEntryStore } from "@suhui/store/entry/store"
import { useFeedById } from "@suhui/store/feed/hooks"
import { useSubscriptionStore } from "@suhui/store/subscription/store"
import { useUnreadStore } from "@suhui/store/unread/store"
import { entrySyncServices } from "@suhui/store/entry/store"
import { unreadSyncService } from "@suhui/store/unread/store"
import { remoteSSEHandler } from "@suhui/store/remote/sse-handler"

// ============ 远程端应用 ============

export function RemoteApp() {
  const [activeFeedId, setActiveFeedId] = useState<string | null>(null)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [connected, setConnected] = useState(true)
  const [feedListVersion, setFeedListVersion] = useState(0)

  // 获取订阅数据
  const subscriptionState = useSubscriptionStore()
  const unreadState = useUnreadStore()

  // 从订阅 store 中提取 feed 列表
  const feedList = useMemo(() => {
    const feeds: Array<{
      feedId: string
      title: string | null
      category: string | null
    }> = []

    const { data, feedIdByView } = subscriptionState
    const feedIds = feedIdByView[0] // FeedViewType.All = 0

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
  }, [subscriptionState.data, subscriptionState.feedIdByView, feedListVersion])

  // 设置 SSE 连接状态监听
  useEffect(() => {
    remoteSSEHandler.setHandlers({
      onConnectionChange: (isConnected) => {
        setConnected(isConnected)
      },
      onSubscriptionsUpdated: () => {
        setFeedListVersion((v) => v + 1)
      },
    })
  }, [])

  // 设置默认活跃 feed
  useEffect(() => {
    if (!activeFeedId && feedList.length > 0 && feedList[0]) {
      setActiveFeedId(feedList[0].feedId)
    }
  }, [feedList, activeFeedId])

  return (
    <div className="flex h-screen flex-col bg-theme-background">
      {/* 顶部状态栏 */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Suhui Remote</h1>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs",
              connected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
            )}
          >
            {connected ? "Online" : "Offline"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              unreadOnly ? "text-accent-foreground bg-accent" : "bg-muted hover:bg-muted/80",
            )}
            onClick={() => setUnreadOnly(!unreadOnly)}
          >
            {unreadOnly ? "Unread Only" : "All Entries"}
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 订阅列 */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-border bg-sidebar">
          <div className="p-2">
            {feedList.map((feed) => {
              const unread = unreadState.data[feed.feedId] ?? 0
              return (
                <FeedItem
                  key={feed.feedId}
                  feedId={feed.feedId}
                  title={feed.title}
                  category={feed.category}
                  unread={unread}
                  active={activeFeedId === feed.feedId}
                  onClick={() => {
                    setActiveFeedId(feed.feedId)
                    setActiveEntryId(null)
                  }}
                />
              )
            })}
          </div>
        </aside>

        {/* 条目列 */}
        <div className="w-80 shrink-0 overflow-y-auto border-r border-border">
          <EntryColumn
            feedId={activeFeedId}
            unreadOnly={unreadOnly}
            activeEntryId={activeEntryId}
            onSelectEntry={setActiveEntryId}
          />
        </div>

        {/* 内容区 */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <EntryContentPanel entryId={activeEntryId} />
        </div>
      </div>
    </div>
  )
}

// ============ 子组件 ============

function FeedItem({
  feedId,
  title,
  category,
  unread,
  active,
  onClick,
}: {
  feedId: string
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
  unreadOnly,
  activeEntryId,
  onSelectEntry,
}: {
  feedId: string | null
  unreadOnly: boolean
  activeEntryId: string | null
  onSelectEntry: (entryId: string) => void
}) {
  // 获取条目 ID 列表
  const entryIds = useMemo(() => {
    if (!feedId) return []
    const { entryIdByFeed, data } = useEntryStore.getState()
    const ids = entryIdByFeed[feedId]
    if (!ids) return []

    const result: string[] = []
    for (const id of ids) {
      const entry = data[id]
      if (entry && (!unreadOnly || !entry.read)) {
        result.push(id)
      }
    }

    // 按发布时间排序
    result.sort((a, b) => {
      const entryA = data[a]
      const entryB = data[b]
      return (entryB?.publishedAt ?? 0) - (entryA?.publishedAt ?? 0)
    })

    return result
  }, [feedId, unreadOnly])

  if (!feedId) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-4">
        Select a feed to view entries
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
    <article className="mx-auto max-w-3xl px-8 py-12">
      {/* 标题 */}
      <h1 className="text-2xl font-bold leading-tight">{entry.title || "Untitled"}</h1>

      {/* 元信息 */}
      <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-2 text-sm">
        {feed?.title && <span>{feed.title}</span>}
        {entry.author && <span>· {entry.author}</span>}
        {entry.publishedAt && <span>· {new Date(entry.publishedAt).toLocaleString()}</span>}
      </div>

      {/* 操作按钮 */}
      <div className="mt-4 flex items-center gap-2">
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
