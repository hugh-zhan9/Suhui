import { entriesTable } from "@suhui/database/schemas/index"
import { and, eq, isNull } from "drizzle-orm"

import { buildStableLocalEntryId, normalizeEntryUrl } from "~/ipc/services/rss-refresh"
import type { ScrapedArticle } from "~/ipc/services/site-scrape"
import { DBManager } from "~/manager/db"

import { localReadingPipeline } from "../local-reading/pipeline"
import { extractHistoryContent } from "./history-content"
import { fetchHistoryPage, validateHistoryUrl } from "./history-fetch"
import { parseHistoryPage } from "./history-page"
import { runFeedOperation } from "./operation"

const HISTORY_BATCH_SIZE = 10
const HISTORY_PAGES_PER_BATCH = 4
const HISTORY_PAGE_LIMIT = 100
const HISTORY_SESSION_LIMIT = 32

export type FeedHistoryResult = {
  added: number
  hasMore: boolean
  status: "more" | "complete" | "unsupported" | "limit"
  scannedPages: number
}
type HistoryFeed = { url: string; siteUrl: string | null }
type HistoryArticle = ScrapedArticle & { content: string }
type HistorySession = {
  source: string
  database: unknown
  pages: string[]
  visited: string[]
  signatures: string[]
  pending: ScrapedArticle[]
  recognized: boolean
}

const readHistoryFeed = async (feedId: string): Promise<HistoryFeed> => {
  const db = DBManager.getDB()
  const [feed, subscription] = await Promise.all([
    db.query.feedsTable.findFirst({ where: (t) => and(eq(t.id, feedId), isNull(t.deletedAt)) }),
    db.query.subscriptionsTable.findFirst({
      where: (t) => and(eq(t.feedId, feedId), isNull(t.deletedAt)),
    }),
  ])
  if (!feed || !subscription) throw new Error("该订阅已不存在")
  return feed
}

const readHistoryUrls = async (feedId: string) => {
  const rows = await DBManager.getDB().query.entriesTable.findMany({
    where: (t) => eq(t.feedId, feedId),
    columns: { url: true },
  })
  return rows.map(({ url }) => normalizeEntryUrl(url)).filter(Boolean)
}

export const insertMissingHistoryArticles = (
  feedId: string,
  source: HistoryFeed,
  articles: HistoryArticle[],
) =>
  runFeedOperation(feedId, async () => {
    const current = await readHistoryFeed(feedId)
    if (current.url !== source.url || current.siteUrl !== source.siteUrl)
      throw new Error("订阅地址已改变，请重新打开列表")
    const existing = new Set(await readHistoryUrls(feedId))
    const rows = articles
      .filter((article) => !existing.has(normalizeEntryUrl(article.url)))
      .map((article) => ({
        id: `local_history_${buildStableLocalEntryId({ feedId, guid: normalizeEntryUrl(article.url), url: normalizeEntryUrl(article.url) })}`,
        feedId,
        guid: normalizeEntryUrl(article.url),
        url: article.url,
        title: article.title,
        content: article.content,
        description: article.description,
        publishedAt: article.publishedAt,
        insertedAt: Date.now(),
        read: false,
      }))
    if (rows.length === 0) return 0
    const inserted = await DBManager.getDB()
      .insert(entriesTable)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: entriesTable.id })
    await localReadingPipeline.processNewEntries(inserted.map(({ id }) => id))
    return inserted.length
  })

type HistoryDependencies = {
  readFeed: typeof readHistoryFeed
  readUrls: typeof readHistoryUrls
  insert: typeof insertMissingHistoryArticles
  fetchPage: typeof fetchHistoryPage
  extractContent: typeof extractHistoryContent
  database: () => unknown
  track: <T>(task: () => Promise<T>) => Promise<T>
}

export class FeedHistoryService {
  private sessions = new Map<string, HistorySession>()
  private requests = new Map<string, Promise<FeedHistoryResult>>()
  private deps: HistoryDependencies

  constructor(deps: Partial<HistoryDependencies> = {}) {
    this.deps = {
      readFeed: readHistoryFeed,
      readUrls: readHistoryUrls,
      insert: insertMissingHistoryArticles,
      fetchPage: fetchHistoryPage,
      extractContent: extractHistoryContent,
      database: () => DBManager.getDB(),
      track: (task) => DBManager.runTrackedOperation(task),
      ...deps,
    }
  }

  loadMore(feedId: string): Promise<FeedHistoryResult> {
    if (typeof feedId !== "string" || !feedId.trim())
      return Promise.reject(new Error("订阅 ID 不能为空"))
    const running = this.requests.get(feedId)
    if (running) return running
    const request = this.deps.track(() => this.loadBatch(feedId))
    this.requests.set(feedId, request)
    void request
      .finally(() => {
        if (this.requests.get(feedId) === request) this.requests.delete(feedId)
      })
      .catch(() => {})
    return request
  }

  private async loadBatch(feedId: string): Promise<FeedHistoryResult> {
    const feed = await this.deps.readFeed(feedId)
    const source = JSON.stringify([feed.url, feed.siteUrl])
    const siteUrl = validateHistoryUrl(feed.siteUrl || new URL(feed.url).origin).href
    const { origin } = new URL(siteUrl)
    const database = this.deps.database()
    const cached = this.sessions.get(feedId)
    const previous = cached?.source === source && cached.database === database ? cached : null
    // Advance only the working copy. A failed batch remains explicitly retryable.
    const state: HistorySession = previous
      ? {
          ...previous,
          pages: [...previous.pages],
          visited: [...previous.visited],
          signatures: [...previous.signatures],
          pending: [...previous.pending],
        }
      : {
          source,
          database,
          pages: [siteUrl],
          visited: [],
          signatures: [],
          pending: [],
          recognized: false,
        }
    const existing = new Set(await this.deps.readUrls(feedId))
    state.pending = state.pending.filter((article) => !existing.has(normalizeEntryUrl(article.url)))
    const candidateUrls = new Set(state.pending.map(({ url }) => normalizeEntryUrl(url)))
    let scanned = 0
    while (
      state.pending.length < HISTORY_BATCH_SIZE &&
      state.pages.length > 0 &&
      scanned < HISTORY_PAGES_PER_BATCH &&
      state.visited.length < HISTORY_PAGE_LIMIT
    ) {
      const url = state.pages.shift()!
      if (state.visited.includes(url)) continue
      const page = await this.deps.fetchPage(url, origin)
      const listing = parseHistoryPage(page.html, page.url, state.signatures)
      state.visited.push(url)
      if (page.url !== url) state.visited.push(page.url)
      scanned++
      state.recognized ||= listing.articles.length > 0
      state.signatures = [...new Set([...state.signatures, ...(listing.signatures ?? [])])]
      for (const article of listing.articles) {
        const key = normalizeEntryUrl(article.url)
        if (existing.has(key) || candidateUrls.has(key)) continue
        state.pending.push(article)
        candidateUrls.add(key)
      }
      state.pages = [
        ...listing.pages.filter(
          (next) => !state.visited.includes(next) && !state.pages.includes(next),
        ),
        ...state.pages,
      ]
    }
    const candidates = state.pending.slice(0, HISTORY_BATCH_SIZE)
    const articles: HistoryArticle[] = []
    // Two bounded request slots, with no partial database write on extraction failure.
    for (let offset = 0; offset < candidates.length; offset += 2) {
      const batch = await Promise.allSettled(
        candidates.slice(offset, offset + 2).map(async (article) => {
          const page = await this.deps.fetchPage(article.url, origin)
          return { ...article, content: this.deps.extractContent(page.html, page.url) }
        }),
      )
      for (const result of batch) {
        if (result.status === "rejected") throw result.reason
        articles.push(result.value)
      }
    }
    const added = articles.length > 0 ? await this.deps.insert(feedId, feed, articles) : 0
    state.pending.splice(0, candidates.length)
    this.sessions.delete(feedId)
    this.sessions.set(feedId, state)
    if (this.sessions.size > HISTORY_SESSION_LIMIT)
      this.sessions.delete(this.sessions.keys().next().value!)
    const status =
      state.pending.length > 0
        ? "more"
        : state.pages.length > 0
          ? state.visited.length >= HISTORY_PAGE_LIMIT
            ? "limit"
            : "more"
          : state.recognized
            ? "complete"
            : "unsupported"
    return { added, hasMore: status === "more", status, scannedPages: state.visited.length }
  }
}

export const feedHistoryService = new FeedHistoryService()
