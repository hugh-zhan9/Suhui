import { EntryService } from "@suhui/database/services/entry"
import { readability } from "@suhui/readability"

import type { ParsedFeed } from "./rss-parser"
import { buildStableLocalEntryId } from "./rss-refresh"

/** Upper bound on article pages fetched for one feed build. */
export const MAX_HYDRATED_ARTICLES = 30
export const ARTICLE_HYDRATION_CONCURRENCY = 4
export const ARTICLE_HYDRATION_TIMEOUT_MS = 15_000

export type ArticleExtractor = (url: string) => Promise<string | null>
/** Returns the subset of entry ids that already have stored content. */
export type StoredContentLookup = (entryIds: string[]) => Promise<Set<string>>

type ParsedItem = ParsedFeed["items"][number]

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Reads an article page and returns its main content as HTML. */
export const extractArticleWithReadability: ArticleExtractor = async (url) => {
  const parsed = await withTimeout(
    readability(url),
    ARTICLE_HYDRATION_TIMEOUT_MS,
    "Article request",
  )
  return parsed?.content || null
}

export const readStoredContentIds: StoredContentLookup = async (entryIds) => {
  if (entryIds.length === 0) return new Set()
  const rows = await EntryService.getEntryMany(entryIds)
  return new Set(rows.filter((row) => !!row.content && row.content.length > 0).map((row) => row.id))
}

/**
 * Fetches full article text for scraped items so they read like any other
 * subscription. Items whose entry already has stored content are skipped, which
 * keeps a refresh to the newly discovered articles only.
 *
 * A page that cannot be fetched or parsed is left alone: the caller keeps the
 * listing excerpt rather than losing the entry.
 */
export const hydrateScrapedArticleContent = async ({
  feedId,
  items,
  lookupStoredContentIds = readStoredContentIds,
  extractArticle = extractArticleWithReadability,
  maxArticles = MAX_HYDRATED_ARTICLES,
  concurrency = ARTICLE_HYDRATION_CONCURRENCY,
  onError,
}: {
  feedId: string
  items: ParsedItem[]
  lookupStoredContentIds?: StoredContentLookup
  extractArticle?: ArticleExtractor
  maxArticles?: number
  concurrency?: number
  onError?: (info: { url: string; reason: string }) => void
}): Promise<Map<string, string>> => {
  const candidates = items
    .map((item) => ({
      id: buildStableLocalEntryId({
        feedId,
        guid: item.guid,
        url: item.url,
        title: item.title,
        publishedAt: item.publishedAt,
      }),
      url: item.url,
    }))
    .filter((candidate) => !!candidate.url)

  if (candidates.length === 0) return new Map()

  const alreadyStored = await lookupStoredContentIds(candidates.map((candidate) => candidate.id))
  const pending = candidates
    .filter((candidate) => !alreadyStored.has(candidate.id))
    .slice(0, maxArticles)

  const hydrated = new Map<string, string>()
  for (let offset = 0; offset < pending.length; offset += concurrency) {
    const batch = pending.slice(offset, offset + concurrency)
    await Promise.all(
      batch.map(async ({ id, url }) => {
        try {
          const content = await extractArticle(url)
          if (content) hydrated.set(id, content)
        } catch (error) {
          onError?.({ url, reason: error instanceof Error ? error.message : String(error) })
        }
      }),
    )
  }

  return hydrated
}
