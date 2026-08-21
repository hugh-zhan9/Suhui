import type { FeedCandidate } from "./feed-discovery"
import { discoverFeedCandidates, looksLikeHtml } from "./feed-discovery"
import { assessFeedStaleness } from "./feed-staleness"
import type { ParsedFeed } from "./rss-parser"
import { parseRssFeed } from "./rss-parser"
import { buildScrapedFeed, extractSiteArticles } from "./site-scrape"
import { buildSiteScrapeUrl } from "./site-scrape-url"

/** Raised when a page is neither a feed, nor advertises one, nor can be scraped. */
export const FEED_DISCOVERY_FAILED = "FEED_DISCOVERY_FAILED"

export type FeedDocumentSource = "direct" | "discovered" | "scraped"

export type FeedSourceOption = {
  url: string
  kind: "feed" | "scraped"
  itemCount: number
  /** Epoch ms of the newest dated item, or null when nothing carries a date. */
  newestPublishedAt: number | null
}

/**
 * What the subscribe screen can offer. `alternatives` is only populated when a
 * real choice exists, so the UI stays quiet in the ordinary case.
 */
export type FeedSourceChoice = {
  active: FeedSourceOption
  alternatives: FeedSourceOption[]
  /** Days the advertised feed trails the page, when that is why a choice exists. */
  staleLagDays?: number
}

export type ResolvedFeedDocument = {
  parsed: ParsedFeed
  /** The url that should be persisted for this feed. */
  feedUrl: string
  source: FeedDocumentSource
  /** Set when a candidate feed was found by discovery. */
  discoveredVia?: FeedCandidate["source"]
  sourceOptions: FeedSourceChoice
}

const newestPublishedAt = (parsed: ParsedFeed) => {
  const stamps = parsed.items.map((item) => item.publishedAt).filter((at) => at > 0)
  return stamps.length > 0 ? Math.max(...stamps) : null
}

const describeSource = (
  url: string,
  kind: FeedSourceOption["kind"],
  parsed: ParsedFeed,
): FeedSourceOption => ({
  url,
  kind,
  itemCount: parsed.items.length,
  newestPublishedAt: newestPublishedAt(parsed),
})

export type CandidateFetch = (url: string) => Promise<{ body: string; contentType?: string }>

/** How many discovery candidates may be requested before giving up. */
export const MAX_DISCOVERY_CANDIDATES = 8
const CANDIDATE_BATCH_SIZE = 4
/** Wall-clock ceiling for the whole probing phase, independent of per-request timeouts. */
export const DISCOVERY_BUDGET_MS = 20_000

const parseCandidate = (body: string) => {
  try {
    const parsed = parseRssFeed(body)
    return parsed.items.length > 0 ? parsed : null
  } catch {
    return null
  }
}

const probeCandidates = async (
  candidates: FeedCandidate[],
  fetchCandidate: CandidateFetch,
  now: () => number = Date.now,
) => {
  const limited = candidates.slice(0, MAX_DISCOVERY_CANDIDATES)
  const deadline = now() + DISCOVERY_BUDGET_MS

  for (let offset = 0; offset < limited.length; offset += CANDIDATE_BATCH_SIZE) {
    // a per-request timeout does not bound the phase: redirects multiply it
    if (now() >= deadline) return null
    const batch = limited.slice(offset, offset + CANDIDATE_BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (candidate) => {
        try {
          const response = await fetchCandidate(candidate.url)
          return { candidate, parsed: parseCandidate(response.body) }
        } catch {
          return { candidate, parsed: null }
        }
      }),
    )
    // preserve candidate ranking inside the batch
    const hit = results.find((result) => result.parsed)
    if (hit?.parsed) return { candidate: hit.candidate, parsed: hit.parsed }
  }

  return null
}

const scrapePage = (body: string, requestUrl: string) => {
  const scraped = extractSiteArticles(body, requestUrl)
  if (scraped.rejectedReason) return { rejectedReason: scraped.rejectedReason, resolved: null }

  const parsed = buildScrapedFeed({ html: body, pageUrl: requestUrl, articles: scraped.articles })
  const feedUrl = buildSiteScrapeUrl(requestUrl)

  return {
    rejectedReason: null,
    resolved: {
      parsed,
      feedUrl,
      source: "scraped" as const,
      sourceOptions: {
        active: describeSource(feedUrl, "scraped", parsed),
        alternatives: [],
      },
    },
  }
}

/**
 * Turns a fetched response into a parsed feed.
 *
 * `scrape` mode reads the response as an article listing. `feed` mode parses it
 * as a feed document and, only when that fails on an HTML page, looks for a feed
 * the page advertises and finally falls back to scraping the page itself.
 */
export const resolveFeedDocument = async ({
  mode,
  requestUrl,
  body,
  contentType,
  fetchCandidate,
  allowDiscovery = true,
  now,
}: {
  mode: "feed" | "scrape"
  requestUrl: string
  body: string
  contentType?: string
  fetchCandidate: CandidateFetch
  /**
   * Discovery and scraping belong to the subscribe flow. A refresh of an
   * existing feed must keep failing loudly when its url stops serving a feed,
   * instead of silently adopting whatever the host now returns.
   */
  allowDiscovery?: boolean
  now?: () => number
}): Promise<ResolvedFeedDocument> => {
  if (mode === "scrape") {
    const { rejectedReason, resolved } = scrapePage(body, requestUrl)
    if (!resolved) {
      throw new Error(`${FEED_DISCOVERY_FAILED}: ${requestUrl} scrape rejected (${rejectedReason})`)
    }
    return resolved
  }

  try {
    const parsed = parseRssFeed(body)
    return {
      parsed,
      feedUrl: requestUrl,
      source: "direct",
      sourceOptions: {
        active: describeSource(requestUrl, "feed", parsed),
        alternatives: [],
      },
    }
  } catch (parseError) {
    if (!allowDiscovery) throw parseError
    if (!looksLikeHtml(body, contentType)) throw parseError

    const candidates = discoverFeedCandidates(body, requestUrl)
    const hit = await probeCandidates(candidates, fetchCandidate, now)
    if (hit) {
      const feedOption = describeSource(hit.candidate.url, "feed", hit.parsed)
      // the page html is already in hand, so checking whether the advertised
      // feed still tracks the site costs no extra request
      const scrapeAttempt = scrapePage(body, requestUrl)
      const staleness = assessFeedStaleness({
        feedItems: hit.parsed.items,
        pageArticles: scrapeAttempt.resolved?.parsed.items ?? [],
      })

      if (staleness.stale && scrapeAttempt.resolved) {
        // the advertised feed stopped tracking the site: lead with the page and
        // keep the feed as the explicit alternative
        return {
          ...scrapeAttempt.resolved,
          sourceOptions: {
            active: scrapeAttempt.resolved.sourceOptions.active,
            alternatives: [feedOption],
            ...(staleness.lagDays === null ? {} : { staleLagDays: staleness.lagDays }),
          },
        }
      }

      return {
        parsed: hit.parsed,
        feedUrl: hit.candidate.url,
        source: "discovered",
        discoveredVia: hit.candidate.source,
        sourceOptions: { active: feedOption, alternatives: [] },
      }
    }

    const { rejectedReason, resolved } = scrapePage(body, requestUrl)
    if (resolved) return resolved

    throw new Error(
      `${FEED_DISCOVERY_FAILED}: ${requestUrl} has no discoverable feed ` +
        `(${candidates.length} candidates checked, scrape rejected: ${rejectedReason})`,
    )
  }
}
