import { DOMParser } from "linkedom/worker"

export type FeedCandidateSource = "link-tag" | "platform" | "anchor" | "generator" | "common-path"

export type FeedCandidate = {
  url: string
  source: FeedCandidateSource
  title?: string
}

const FEED_LINK_TYPES = new Set([
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
  "application/rdf+xml",
  "application/xml",
  "text/xml",
])

const FEED_HREF_PATTERN =
  /(?:^|\/)(?:feed|feeds|rss|atom|index)(?:\.(?:xml|json|rss|atom))?\/?(?:\?|$)/i

/** Default feed paths per site generator, most likely first. */
const GENERATOR_PATHS: Array<{ match: string; paths: string[] }> = [
  { match: "hexo", paths: ["/atom.xml", "/rss2.xml", "/feed.xml"] },
  { match: "hugo", paths: ["/index.xml", "/feed.xml"] },
  { match: "wordpress", paths: ["/feed/", "/?feed=rss2"] },
  { match: "ghost", paths: ["/rss/"] },
  { match: "jekyll", paths: ["/feed.xml", "/atom.xml"] },
  { match: "vitepress", paths: ["/feed.rss"] },
  { match: "docusaurus", paths: ["/blog/rss.xml", "/blog/atom.xml"] },
  { match: "gatsby", paths: ["/rss.xml"] },
  { match: "astro", paths: ["/rss.xml", "/feed.xml"] },
  { match: "zola", paths: ["/atom.xml", "/rss.xml"] },
]

/** Sites that serve a feed but never advertise it in the page head. */
const platformCandidates = (base: URL): FeedCandidate[] => {
  const host = base.hostname.replace(/^www\./, "").toLowerCase()
  const seg = base.pathname.split("/").filter(Boolean)

  if (host === "youtube.com") {
    if (seg[0] === "channel" && seg[1]) {
      return [
        {
          url: `https://www.youtube.com/feeds/videos.xml?channel_id=${seg[1]}`,
          source: "platform",
        },
      ]
    }
    const list = base.searchParams.get("list")
    if (seg[0] === "playlist" && list) {
      return [
        { url: `https://www.youtube.com/feeds/videos.xml?playlist_id=${list}`, source: "platform" },
      ]
    }
    return []
  }
  if (host === "github.com" && seg.length >= 2) {
    return [
      { url: `https://github.com/${seg[0]}/${seg[1]}/releases.atom`, source: "platform" },
      { url: `https://github.com/${seg[0]}/${seg[1]}/commits.atom`, source: "platform" },
    ]
  }
  if (host === "reddit.com" && seg[0] === "r" && seg[1]) {
    return [{ url: `https://www.reddit.com/r/${seg[1]}/.rss`, source: "platform" }]
  }
  if (host === "medium.com" && seg[0]?.startsWith("@")) {
    return [{ url: `https://medium.com/feed/${seg[0]}`, source: "platform" }]
  }
  if (host === "substack.com" || host.endsWith(".substack.com")) {
    return [{ url: new URL("/feed", base).toString(), source: "platform" }]
  }
  return []
}

/**
 * Guessed paths, used only when the page itself advertises nothing. Kept short
 * on purpose: every entry costs one extra request on the subscribe path.
 */
export const COMMON_FEED_PATHS = ["/atom.xml", "/feed", "/rss.xml", "/index.xml"]

/**
 * Loopback, private, link-local and other non-routable hosts. Page markup must
 * not be able to aim main-process requests at the machine or its network.
 */
export const isPrivateNetworkHost = (hostname: string) => {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
  if (!host) return true
  if (host === "localhost" || /\.(?:local|localhost|internal|home|lan)$/.test(host)) return true

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const first = Number(ipv4[1])
    const second = Number(ipv4[2])
    if (first === 0 || first === 10 || first === 127) return true
    if (first === 172 && second >= 16 && second <= 31) return true
    if (first === 192 && second === 168) return true
    if (first === 169 && second === 254) return true
    if (first === 100 && second >= 64 && second <= 127) return true
    return first >= 224
  }

  if (host === "::" || host === "::1") return true
  if (host.startsWith("::ffff:")) return true
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true
  return false
}

const safeUrl = (href: string, base: string) => {
  try {
    const parsed = new URL(href, base)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Ranked feed candidates for an HTML page, highest precision first. Pure: the
 * caller is responsible for fetching and validating each candidate.
 */
export const discoverFeedCandidates = (html: string, pageUrl: string): FeedCandidate[] => {
  let base: URL
  try {
    base = new URL(pageUrl)
  } catch {
    return []
  }

  // a page may only send us somewhere public, or back to its own host
  const allowedTarget = (candidateUrl: string) => {
    try {
      const host = new URL(candidateUrl).hostname
      return host.toLowerCase() === base.hostname.toLowerCase() || !isPrivateNetworkHost(host)
    } catch {
      return false
    }
  }

  const document = new DOMParser().parseFromString(html, "text/html")
  const linkTags: FeedCandidate[] = []
  const anchors: FeedCandidate[] = []

  for (const node of document.querySelectorAll("link")) {
    const rel = (node.getAttribute("rel") ?? "").toLowerCase().split(/\s+/)
    if (!rel.includes("alternate")) continue
    const type = (node.getAttribute("type") ?? "").toLowerCase().trim()
    if (!FEED_LINK_TYPES.has(type)) continue
    const url = safeUrl(node.getAttribute("href") ?? "", base.toString())
    if (!url) continue
    linkTags.push({ url, source: "link-tag", title: node.getAttribute("title") ?? undefined })
  }

  for (const node of document.querySelectorAll("a[href]")) {
    const href = node.getAttribute("href") ?? ""
    if (!FEED_HREF_PATTERN.test(href)) continue
    const url = safeUrl(href, base.toString())
    if (!url) continue
    // an index page is not a feed; only keep it when it names a feed extension
    if (/(?:^|\/)index\/?$/i.test(new URL(url).pathname)) continue
    anchors.push({ url, source: "anchor" })
  }

  const generator = (
    document.querySelector('meta[name="generator"]')?.getAttribute("content") ?? ""
  ).toLowerCase()
  const generatorPaths = GENERATOR_PATHS.find((entry) => generator.includes(entry.match))
  const generatorCandidates: FeedCandidate[] = (generatorPaths?.paths ?? []).flatMap((path) => {
    const url = safeUrl(path, base.toString())
    return url ? [{ url, source: "generator" as const }] : []
  })

  const advertised = [...linkTags, ...platformCandidates(base), ...anchors, ...generatorCandidates]

  const commonPaths: FeedCandidate[] =
    advertised.length > 0
      ? []
      : COMMON_FEED_PATHS.flatMap((path) => {
          const url = safeUrl(path, base.toString())
          return url ? [{ url, source: "common-path" as const }] : []
        })

  const seen = new Set<string>()
  const ranked: FeedCandidate[] = []
  for (const candidate of [...advertised, ...commonPaths]) {
    if (!allowedTarget(candidate.url)) continue
    const key = candidate.url.replace(/\/+$/, "")
    if (seen.has(key)) continue
    seen.add(key)
    ranked.push(candidate)
  }

  return ranked
}

/** True when a response body is a web page rather than a feed document. */
export const looksLikeHtml = (body: string, contentType?: string) => {
  if (contentType && /\b(?:text\/html|application\/xhtml)/i.test(contentType)) return true
  const head = body.slice(0, 1000).toLowerCase()
  if (/<\?xml/.test(head) && !/<html/.test(head)) return false
  return /<!doctype\s+html|<html[\s>]/.test(head)
}
