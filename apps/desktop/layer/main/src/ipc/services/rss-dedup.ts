type FeedLike = {
  id: string
  url: string | null
  siteUrl: string | null
}

export const normalizeFeedUrlForDedup = (value?: string | null) => {
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

const normalizeSiteHostForDedup = (value?: string | null) => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

export const findDuplicateFeed = (
  existingFeeds: FeedLike[],
  nextFeedUrl: string,
  nextSiteUrl?: string | null,
) => {
  const nextFeedNormalized = normalizeFeedUrlForDedup(nextFeedUrl)
  if (!nextFeedNormalized) return

  const duplicateByFeedUrl = existingFeeds.find(
    (feed) => normalizeFeedUrlForDedup(feed.url) === nextFeedNormalized,
  )
  if (duplicateByFeedUrl) return duplicateByFeedUrl

  const nextSiteHost = normalizeSiteHostForDedup(nextSiteUrl)
  if (!nextSiteHost) return

  return existingFeeds.find((feed) => normalizeSiteHostForDedup(feed.siteUrl) === nextSiteHost)
}
