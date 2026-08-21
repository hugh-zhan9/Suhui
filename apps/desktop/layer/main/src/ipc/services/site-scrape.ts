import { DOMParser } from "linkedom/worker"

import type { ParsedFeed } from "./rss-parser"

export type ArticleDateSource = "time-attr" | "time-text" | "text" | "url-path"

export type ScrapedArticle = {
  url: string
  title: string
  description: string
  /** Epoch ms, or 0 when the page exposes no usable date. */
  publishedAt: number
  dateSource: ArticleDateSource | null
}

export type ScrapeConfidence = {
  itemCount: number
  datedRatio: number
  pathConsistency: number
  titleQuality: number
  score: number
}

export type ScrapeRejection =
  | "NO_REPEATED_LINK_GROUP"
  | "TOO_FEW_ITEMS"
  | "NO_RELIABLE_DATES"
  | "LOW_CONFIDENCE"

export type SiteScrapeResult = {
  articles: ScrapedArticle[]
  confidence: ScrapeConfidence | null
  /** null when the result cleared the confidence bar. */
  rejectedReason: ScrapeRejection | null
}

/**
 * Unattended generation only proceeds above this bar. A page we cannot read
 * confidently is reported as a failure rather than turned into navigation-link
 * "articles".
 */
export const SCRAPE_CONFIDENCE = {
  minItems: 3,
  minDatedRatio: 0.5,
  minScore: 0.55,
} as const

const NAV_TEXT =
  /^(?:home|about|archives?|categor(?:y|ies)|tags?|search|rss|feed|subscribe|log ?in|sign ?(?:in|up)|next|prev(?:ious)?|more|read more|continue reading|share|contact|privacy|terms|docs|pricing|download|sponsor|首页|关于|归档|分类|标签|搜索|订阅|登录|注册|更多|下一页|上一页|阅读全文|联系|隐私|条款|文档|定价|下载|赞助)$/i

const NON_ARTICLE_PATH =
  /^\/(?:tags?|categor(?:y|ies)|archives?|page|about|search|login|signup|auth|feed|rss|atom)(?:\/|$)/i

const ASSET_PATH = /\.(?:png|jpe?g|gif|svg|webp|ico|css|js|mjs|xml|json|zip|pdf|rss|atom)$/i

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const inPlausibleRange = (date: Date) => {
  const year = date.getUTCFullYear()
  return year >= 1990 && year <= 2100
}

/**
 * Builds a UTC midnight date from explicit parts. Date-only values are always
 * anchored to UTC so two items on the same page cannot end up a timezone offset
 * apart just because the page wrote their dates in different formats.
 */
const utcFromParts = (year: number, month: number, day: number) => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  // reject calendar overflow such as 2026-02-30 silently rolling into March
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return inPlausibleRange(date) ? date : null
}

/**
 * Only trusts a value that names a specific day. A bare year or year-month
 * would have to invent the missing parts, and template engines leak `${...}`
 * literals into datetime attributes.
 */
export const parseArticleDate = (raw: string | null | undefined) => {
  if (!raw) return null
  const value = String(raw).trim()
  if (!value || value.includes("${") || value.includes("{{")) return null

  // a full timestamp keeps whatever offset the document declared
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) {
    const parsed = Date.parse(value)
    if (!Number.isFinite(parsed)) return null
    const date = new Date(parsed)
    return inPlausibleRange(date) ? date : null
  }

  const numeric = value.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/)
  if (numeric) return utcFromParts(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]))

  const monthFirst = value.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i)
  if (monthFirst) {
    const month = MONTH_INDEX[monthFirst[1]!.slice(0, 3).toLowerCase()]
    if (month) return utcFromParts(Number(monthFirst[3]), month, Number(monthFirst[2]))
  }

  const dayFirst = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})\b/i)
  if (dayFirst) {
    const month = MONTH_INDEX[dayFirst[2]!.slice(0, 3).toLowerCase()]
    if (month) return utcFromParts(Number(dayFirst[3]), month, Number(dayFirst[1]))
  }

  return null
}

/** Dates a permalink states itself, e.g. /2026/05/21/slug/. Always per-item. */
const dateFromUrlPath = (url: string) => {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return null
  }
  const match = pathname.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\/|$|[-_])/)
  if (!match) return null
  return utcFromParts(Number(match[1]), Number(match[2]), Number(match[3]))
}

const LOOSE_DATE =
  /\b(\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}|\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/i

const normalizeText = (value: string | null | undefined) =>
  (value ?? "").replaceAll(/\s+/g, " ").trim()

const classSignature = (element: any) => {
  const classes = normalizeText(element.getAttribute?.("class") ?? "")
  return classes ? classes.split(" ").sort().join(".") : ""
}

const TITLE_CLASS_HINT = /(?:^|[\s_-])(?:title|headline|heading)(?:[\s_-]|$)/i

/**
 * Card layouts wrap the whole block in one anchor, so the raw anchor text sweeps
 * in dates and category labels. Prefer an inner heading or title-ish element,
 * and otherwise drop any `<time>` text from the fallback.
 */
const titleFromAnchor = (anchor: any) => {
  const heading = anchor.querySelector?.("h1, h2, h3, h4, h5, h6")
  const headingText = normalizeText(heading?.textContent)
  if (headingText) return headingText

  for (const node of anchor.querySelectorAll?.("[class]") ?? []) {
    if (!TITLE_CLASS_HINT.test(node.getAttribute("class") ?? "")) continue
    const text = normalizeText(node.textContent)
    if (text) return text
  }

  let text = normalizeText(anchor.textContent)
  for (const node of anchor.querySelectorAll?.("time") ?? []) {
    const stamp = normalizeText(node.textContent)
    if (stamp) text = text.replace(stamp, " ")
  }
  return normalizeText(text)
}

/**
 * Descendant text with a separator at every element boundary. `textContent`
 * glues adjacent elements together ("(大约7139个字)写在前面"), and it also sweeps in
 * the `<time>` values that were already read as the publish date.
 */
const textWithSeparators = (node: any): string => {
  if (node?.nodeType === 3) return node.textContent ?? ""
  if (node?.nodeType !== 1) return ""

  const tag = String(node.tagName ?? "").toLowerCase()
  if (tag === "script" || tag === "style" || tag === "time") return ""

  const parts: string[] = []
  for (const child of node.childNodes ?? []) parts.push(textWithSeparators(child))
  return parts.join(" ")
}

/** The repeating block an anchor belongs to; grouping and dates are scoped to it. */
const itemContainer = (anchor: any) =>
  anchor.closest("article, li, .post, .entry, .card, .item") ?? anchor.parentElement ?? anchor

const structureSignature = (anchor: any) => {
  const parts: string[] = [`a.${classSignature(anchor)}`]
  let cursor = anchor.parentElement
  for (let depth = 0; depth < 3 && cursor; depth += 1) {
    parts.push(`${String(cursor.tagName ?? "").toLowerCase()}.${classSignature(cursor)}`)
    cursor = cursor.parentElement
  }
  return parts.join(">")
}

const dateFromContainer = (container: any): { date: Date; source: ArticleDateSource } | null => {
  for (const node of container.querySelectorAll?.("time") ?? []) {
    const fromAttr =
      parseArticleDate(node.getAttribute("datetime")) ??
      parseArticleDate(node.getAttribute("dateTime"))
    if (fromAttr) return { date: fromAttr, source: "time-attr" }
    const fromText = parseArticleDate(normalizeText(node.textContent))
    if (fromText) return { date: fromText, source: "time-text" }
  }
  const loose = normalizeText(container.textContent).match(LOOSE_DATE)
  if (loose) {
    const date = parseArticleDate(loose[1])
    if (date) return { date, source: "text" }
  }
  return null
}

const pathShape = (pathname: string) =>
  pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (/^\d{4}$/.test(segment)) return "Y"
      if (/^\d+$/.test(segment)) return "#"
      return "s"
    })
    .join("/")

const modalCount = (values: string[]) => {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = 0
  for (const count of counts.values()) if (count > best) best = count
  return best
}

const scoreGroup = (articles: ScrapedArticle[]): ScrapeConfidence => {
  const itemCount = articles.length
  const datedRatio = articles.filter((item) => item.publishedAt > 0).length / itemCount
  const pathConsistency =
    modalCount(articles.map((item) => pathShape(new URL(item.url).pathname))) / itemCount
  const titleQuality =
    articles.filter((item) => {
      const { title } = item
      return (
        title.length >= 8 &&
        title.length <= 140 &&
        (/\s/.test(title) || /[\u4E00-\u9FFF]/.test(title))
      )
    }).length / itemCount

  const score =
    (Math.min(itemCount, 20) / 20) * 0.2 +
    datedRatio * 0.4 +
    pathConsistency * 0.2 +
    titleQuality * 0.2

  return { itemCount, datedRatio, pathConsistency, titleQuality, score }
}

const judge = (confidence: ScrapeConfidence): ScrapeRejection | null => {
  if (confidence.itemCount < SCRAPE_CONFIDENCE.minItems) return "TOO_FEW_ITEMS"
  if (confidence.datedRatio < SCRAPE_CONFIDENCE.minDatedRatio) return "NO_RELIABLE_DATES"
  if (confidence.score < SCRAPE_CONFIDENCE.minScore) return "LOW_CONFIDENCE"
  return null
}

type Candidate = { article: ScrapedArticle; container: unknown }

/**
 * A container shared by several links in the same group is a list wrapper, not
 * an item wrapper, so anything read out of it belongs to no single link. Without
 * this, one date anywhere in a navigation grid would date every tile in it and
 * carry the group past the date gate.
 */
const dropSharedContainerFacts = (candidates: Candidate[]): ScrapedArticle[] => {
  const containerUses = new Map<unknown, number>()
  for (const candidate of candidates) {
    containerUses.set(candidate.container, (containerUses.get(candidate.container) ?? 0) + 1)
  }

  return candidates.map(({ article, container }) => {
    const shared = (containerUses.get(container) ?? 0) > 1
    const scoped = shared
      ? { ...article, publishedAt: 0, dateSource: null, description: "" }
      : article
    if (scoped.publishedAt > 0) return scoped

    // a date the permalink states itself is per-item by construction
    const fromPath = dateFromUrlPath(scoped.url)
    return fromPath
      ? { ...scoped, publishedAt: fromPath.getTime(), dateSource: "url-path" as const }
      : scoped
  })
}

/**
 * Finds the largest group of structurally identical same-origin links on a page
 * and reads them as an article list. Navigation, headers, footers and sidebars
 * are excluded outright rather than scored down.
 */
export const extractSiteArticles = (html: string, pageUrl: string): SiteScrapeResult => {
  const base = new URL(pageUrl)
  const document = new DOMParser().parseFromString(html, "text/html")
  const groups = new Map<string, Map<string, Candidate>>()

  for (const anchor of document.querySelectorAll("a[href]")) {
    if (anchor.closest("nav, header, footer, aside")) continue

    const title = titleFromAnchor(anchor)
    if (title.length < 4 || title.length > 300) continue
    if (NAV_TEXT.test(title)) continue

    let target: URL
    try {
      target = new URL(anchor.getAttribute("href") ?? "", base)
    } catch {
      continue
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") continue
    if (target.origin !== base.origin) continue
    target.hash = ""
    if (target.pathname === base.pathname && target.search === base.search) continue
    if (ASSET_PATH.test(target.pathname)) continue
    if (NON_ARTICLE_PATH.test(target.pathname)) continue

    const signature = structureSignature(anchor)
    if (!groups.has(signature)) groups.set(signature, new Map())
    const bucket = groups.get(signature)!
    const key = target.toString()
    if (bucket.has(key)) continue

    const container = itemContainer(anchor)
    const dated = dateFromContainer(container)
    const containerText = normalizeText(textWithSeparators(container))
    const description = normalizeText(containerText.replace(title, " ")).slice(0, 300)

    bucket.set(key, {
      container,
      article: {
        url: key,
        title,
        description,
        publishedAt: dated ? dated.date.getTime() : 0,
        dateSource: dated?.source ?? null,
      },
    })
  }

  const scored = [...groups.values()]
    .map((bucket) => dropSharedContainerFacts([...bucket.values()]))
    .filter((articles) => articles.length >= 2)
    .map((articles) => ({ articles, confidence: scoreGroup(articles) }))
    .sort((left, right) => right.confidence.score - left.confidence.score)

  const winner = scored[0]
  if (!winner) return { articles: [], confidence: null, rejectedReason: "NO_REPEATED_LINK_GROUP" }

  const articles = [...winner.articles].sort((left, right) => right.publishedAt - left.publishedAt)
  const rejectedReason = judge(winner.confidence)

  return {
    articles: rejectedReason ? [] : articles,
    confidence: winner.confidence,
    rejectedReason,
  }
}

export const readPageTitle = (html: string) => {
  const document = new DOMParser().parseFromString(html, "text/html")
  return normalizeText(document.querySelector("title")?.textContent) || ""
}

/** Shapes scraped articles like a parsed feed so downstream code stays unchanged. */
export const buildScrapedFeed = ({
  html,
  pageUrl,
  articles,
}: {
  html: string
  pageUrl: string
  articles: ScrapedArticle[]
}): ParsedFeed => ({
  title: readPageTitle(html) || new URL(pageUrl).hostname,
  description: "",
  siteUrl: pageUrl,
  image: "",
  items: articles.map((article) => ({
    title: article.title,
    url: article.url,
    // mirrors parseRss, where content falls back to the description, so the
    // reading pane shows the excerpt instead of nothing
    content: article.description,
    description: article.description,
    guid: article.url,
    author: "",
    publishedAt: article.publishedAt,
  })),
})
