import { FeedViewType, getViewList } from "@suhui/constants"

type RemoteSubscriptionLike = {
  type?: string
  feedId?: string | null
  title?: string | null
  category?: string | null
  view?: FeedViewType | number
}

export type RemoteFeedSummary = {
  feedId: string
  title: string | null
  category: string | null
}

export type RemoteFeedGroup = {
  key: string
  title: string
  feeds: RemoteFeedSummary[]
}

export const getRemoteDesktopLayoutContract = () => ({
  root: "remote-desktop-reader",
  sidebar: "remote-desktop-sidebar",
  timeline: "remote-desktop-timeline",
  reader: "remote-desktop-reader-pane",
  sidebarWidth: 256,
  timelineWidth: 390,
})

export const remoteViewLabelFor = (view: FeedViewType) => {
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

export const getRemoteFeedList = (
  subscriptions: Record<string, RemoteSubscriptionLike>,
  view: FeedViewType,
): RemoteFeedSummary[] =>
  Object.values(subscriptions)
    .filter((subscription) => {
      if (subscription.type !== "feed" || !subscription.feedId) return false
      return view === FeedViewType.All || subscription.view === view
    })
    .map((subscription) => ({
      feedId: subscription.feedId!,
      title: subscription.title ?? null,
      category: subscription.category ?? null,
    }))
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""))

export const buildRemoteFeedGroups = (
  subscriptions: Record<string, RemoteSubscriptionLike>,
  view: FeedViewType,
): RemoteFeedGroup[] => {
  const groupByKey = new Map<string, RemoteFeedGroup>()

  for (const feed of getRemoteFeedList(subscriptions, view)) {
    const title = feed.category?.trim() || "Uncategorized"
    const key = title
    const group = groupByKey.get(key) ?? { key, title, feeds: [] }
    group.feeds.push(feed)
    groupByKey.set(key, group)
  }

  return Array.from(groupByKey.values()).sort((a, b) => {
    if (a.title === "Uncategorized") return 1
    if (b.title === "Uncategorized") return -1
    return a.title.localeCompare(b.title)
  })
}

export const getRemoteAvailableViews = (subscriptions: Record<string, RemoteSubscriptionLike>) => {
  const feedSubscriptions = Object.values(subscriptions).filter(
    (subscription) => subscription.type === "feed" && !!subscription.feedId,
  )
  const viewsWithFeeds = new Set(feedSubscriptions.map((subscription) => subscription.view))

  if (feedSubscriptions.length === 0) return []

  return getViewList({ includeAll: true }).filter(
    (view) => view.view === FeedViewType.All || viewsWithFeeds.has(view.view),
  )
}

export const parseRemoteImportPayload = (raw: string) => {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new Error("Invalid JSON")
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid import payload")
  }

  return payload
}

export const toRemoteDownloadFileName = (title: string | null | undefined, fallback: string) => {
  const source = title?.trim() || fallback
  const sanitized = source
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim()
    .replace(/^\.+$/, "")

  return `${sanitized || "suhui-entry"}.pdf`
}

export const shouldRemoteMarkReadFromSelection = (_selection: {
  entryId: string | null
  read?: boolean | null
  reason: "initial-selection" | "selection-sync" | "user-open"
}) => {
  return _selection.reason === "user-open" && !!_selection.entryId && _selection.read === false
}

export const getRemoteEntryReadVisualState = (read: boolean) => ({
  rowClassName: read ? "is-read" : "is-unread",
  titleClassName: read ? "is-read" : "is-unread",
  unreadDotClassName: read ? "is-read" : "is-unread",
  showUnreadDot: !read,
})

export const getRemotePreferredEntrySelection = (
  activeEntryId: string | null,
  entryIds: string[],
  isMobile: boolean,
  previousEntryIds: string[] = [],
) => {
  if (isMobile) return activeEntryId
  if (activeEntryId && entryIds.includes(activeEntryId)) return activeEntryId
  if (activeEntryId) {
    const previousIndex = previousEntryIds.indexOf(activeEntryId)
    if (previousIndex >= 0) {
      return entryIds[previousIndex] ?? entryIds[previousIndex - 1] ?? entryIds[0] ?? null
    }
    return entryIds[0] ?? null
  }
  return null
}
