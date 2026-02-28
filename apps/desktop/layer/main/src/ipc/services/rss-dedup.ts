type FeedLike = {
  id: string
  url: string | null
  siteUrl: string | null
}

const normalizeUrl = (value?: string | null) => {
  if (!value) return null
  try {
    const url = new URL(value)
    url.hash = ""
    // 站点去重不依赖 query，避免同一 RSS 因追踪参数重复
    url.search = ""
    const pathname = url.pathname.replace(/\/+$/, "")
    return `${url.protocol}//${url.host}${pathname}`
  } catch {
    return value.trim().replace(/\/+$/, "")
  }
}

export const findDuplicateFeed = (
  existingFeeds: FeedLike[],
  nextFeedUrl: string,
  _nextSiteUrl?: string | null,
) => {
  const nextFeedNormalized = normalizeUrl(nextFeedUrl)
  if (!nextFeedNormalized) return

  return existingFeeds.find((feed) => normalizeUrl(feed.url) === nextFeedNormalized)
}
