/**
 * `sitescrape:` marks a feed whose entries are extracted from a normal web page
 * instead of a feed document. The stored url keeps the full target page url so
 * the scheme, path and query all survive a round trip through the database.
 */
export const SITE_SCRAPE_PROTOCOL = "sitescrape:"

export const isSiteScrapeUrl = (url: string) =>
  url.trim().toLowerCase().startsWith(SITE_SCRAPE_PROTOCOL)

export const buildSiteScrapeUrl = (pageUrl: string) => {
  const parsed = new URL(pageUrl)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported site scrape target: ${pageUrl}`)
  }
  return `${SITE_SCRAPE_PROTOCOL}${parsed.toString()}`
}

/** Returns the target page url, or null when the input is not a site-scrape url. */
export const parseSiteScrapeUrl = (url: string) => {
  const trimmed = url.trim()
  if (!isSiteScrapeUrl(trimmed)) return null

  const target = trimmed.slice(SITE_SCRAPE_PROTOCOL.length)
  try {
    const parsed = new URL(target)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return parsed.toString()
  } catch {
    return null
  }
}

export type FeedSourceTarget = {
  /** "scrape" extracts entries from an HTML page; "feed" expects a feed document. */
  mode: "feed" | "scrape"
  /** The http(s) url that should actually be requested. */
  requestUrl: string
}

/**
 * Splits a stored feed url into what to request and how to read the response.
 * Non site-scrape urls pass through untouched.
 */
export const resolveFeedSourceTarget = (url: string): FeedSourceTarget => {
  const target = parseSiteScrapeUrl(url)
  if (target) return { mode: "scrape", requestUrl: target }
  return { mode: "feed", requestUrl: url }
}
