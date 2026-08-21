/**
 * A feed can parse cleanly and still be dead: a leftover static file, or a
 * generator that stopped running after a domain move. Comparing it against the
 * site's own article listing is the only way to notice.
 */
export type FeedStalenessAssessment = {
  stale: boolean
  /** How far the feed trails the page, in whole days. Null when undecidable. */
  lagDays: number | null
  reason: "FEED_MISSING_NEWEST_PAGE_ARTICLE" | null
}

/** Default lag before a feed counts as stale rather than merely lagging. */
export const FEED_STALENESS_MIN_LAG_DAYS = 30

const DAY_MS = 86_400_000

/**
 * Path-only identity: a feed left behind by a domain move still lists the old
 * host, so comparing hosts would call every entry missing.
 */
const entryIdentity = (url: string) => {
  try {
    // query is dropped: feeds commonly append tracking params such as
    // ?utm_source=rss, which would make every entry look like a different one
    return new URL(url).pathname.replace(/\/+$/, "").toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

const datedDescending = <T>(items: T[], publishedAt: (item: T) => number) =>
  items.filter((item) => publishedAt(item) > 0).sort((a, b) => publishedAt(b) - publishedAt(a))

/** How many of the page's newest articles must be missing before calling it stale. */
const CORROBORATING_ARTICLES = 3

/**
 * Stale means both: the page is publishing meaningfully newer articles than the
 * feed carries, and the newest of those articles is absent from the feed. The
 * second condition keeps a feed that merely reports different timestamps from
 * being written off.
 */
export const assessFeedStaleness = ({
  feedItems,
  pageArticles,
  minLagDays = FEED_STALENESS_MIN_LAG_DAYS,
}: {
  feedItems: Array<{ url: string; publishedAt: number }>
  pageArticles: Array<{ url: string; publishedAt: number }>
  minLagDays?: number
}): FeedStalenessAssessment => {
  const pageByDate = datedDescending(pageArticles, (item) => item.publishedAt)
  const feedByDate = datedDescending(feedItems, (item) => item.publishedAt)
  const newestPage = pageByDate[0]
  const newestFeed = feedByDate[0]
  if (!newestPage || !newestFeed) return { stale: false, lagDays: null, reason: null }

  const lagDays = Math.floor((newestPage.publishedAt - newestFeed.publishedAt) / DAY_MS)
  if (lagDays < minLagDays) return { stale: false, lagDays, reason: null }

  // one missing article could be a page-only item; requiring the whole recent
  // head to be absent is what distinguishes a feed that stopped updating
  const feedIdentities = new Set(feedItems.map((item) => entryIdentity(item.url)))
  const recentHead = pageByDate.slice(0, CORROBORATING_ARTICLES)
  const allMissing = recentHead.every((item) => !feedIdentities.has(entryIdentity(item.url)))
  if (!allMissing) return { stale: false, lagDays, reason: null }

  return { stale: true, lagDays, reason: "FEED_MISSING_NEWEST_PAGE_ARTICLE" }
}
