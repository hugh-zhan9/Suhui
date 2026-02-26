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

const getHost = (value?: string | null) => {
  if (!value) return null
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

export const findDuplicateFeed = (
  existingFeeds: FeedLike[],
  nextFeedUrl: string,
  nextSiteUrl?: string | null,
) => {
  const nextFeedNormalized = normalizeUrl(nextFeedUrl)
  const nextHost = getHost(nextSiteUrl) ?? getHost(nextFeedUrl)

  return existingFeeds.find((feed) => {
    const feedUrlNormalized = normalizeUrl(feed.url)
    if (feedUrlNormalized && nextFeedNormalized && feedUrlNormalized === nextFeedNormalized) {
      return true
    }

    const feedHost = getHost(feed.siteUrl) ?? getHost(feed.url)
    return !!feedHost && !!nextHost && feedHost === nextHost
  })
}

