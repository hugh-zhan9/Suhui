import * as http from "node:http"
import * as https from "node:https"

import { EntryService } from "@follow/database/services/entry"
import { FeedService } from "@follow/database/services/feed"
import { SubscriptionService } from "@follow/database/services/subscription"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import { DBManager } from "~/manager/db"

/**
 * Fetches a URL using Node.js built-in http/https, follows up to 5 redirects.
 */
function fetchUrl(url: string, redirectCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Too many redirects"))
      return
    }
    const lib = url.startsWith("https") ? https : http
    lib
      .get(url, { headers: { "User-Agent": "Folo RSS Reader/1.0" } }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          resolve(fetchUrl(res.headers.location, redirectCount + 1))
          return
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const chunks: Buffer[] = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
        res.on("error", reject)
      })
      .on("error", reject)
  })
}

/** Extract text content from the first matching XML tag */
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
  return xml.match(re)?.[1]?.trim() ?? ""
}

/** Extract attribute of the first matching tag */
function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i")
  return xml.match(re)?.[1]?.trim() ?? ""
}

/** Very simple RSS/Atom parser — returns feed metadata + items */
function parseRss(xml: string) {
  // Detect Atom vs RSS
  const isAtom = /<feed[^>]*xmlns[^>]*http:\/\/www\.w3\.org\/2005\/Atom/.test(xml)

  const title = extractTag(xml, "title")
  const description = isAtom ? extractTag(xml, "subtitle") : extractTag(xml, "description")
  const siteUrl = isAtom
    ? extractAttr(xml, 'link[^>]*rel="alternate"', "href") || extractAttr(xml, "link", "href")
    : extractTag(xml, "link")
  const image =
    extractAttr(xml, "image", "url") ||
    extractTag(xml, "url") ||
    extractAttr(xml, "logo", "href") ||
    extractTag(xml, "logo")

  // Split into items / entries
  const itemTag = isAtom ? "entry" : "item"
  const itemRe = new RegExp(`<${itemTag}[^>]*>([\\s\\S]*?)<\\/${itemTag}>`, "gi")
  const items: {
    title: string
    url: string
    content: string
    description: string
    guid: string
    author: string
    publishedAt: number
  }[] = []

  let match: RegExpExecArray | null
  while ((match = itemRe.exec(xml)) !== null) {
    const itemXml = match[1] ?? ""
    const itemTitle = extractTag(itemXml, "title") || extractTag(itemXml, "h1")
    const itemUrl =
      extractTag(itemXml, "link") ||
      extractAttr(itemXml, 'link[^>]*rel="alternate"', "href") ||
      extractAttr(itemXml, "link", "href")
    const itemContent =
      extractTag(itemXml, "content:encoded") ||
      extractTag(itemXml, "content") ||
      extractTag(itemXml, "description")
    const itemDescription = extractTag(itemXml, "description") || extractTag(itemXml, "summary")
    const itemGuid =
      extractTag(itemXml, "guid") ||
      extractTag(itemXml, "id") ||
      itemUrl ||
      Math.random().toString(36)
    const itemAuthor =
      extractTag(itemXml, "dc:creator") ||
      extractTag(itemXml, "author") ||
      extractTag(itemXml, "name")
    const pubDate =
      extractTag(itemXml, "pubDate") ||
      extractTag(itemXml, "published") ||
      extractTag(itemXml, "updated")
    const publishedAt = pubDate ? new Date(pubDate).getTime() : Date.now()

    if (!itemUrl && !itemGuid) continue
    items.push({
      title: itemTitle || "",
      url: itemUrl || "",
      content: itemContent || "",
      description: itemDescription || "",
      guid: itemGuid || Math.random().toString(36),
      author: itemAuthor || "",
      publishedAt: Number.isNaN(publishedAt) ? Date.now() : publishedAt,
    })
  }

  return { title, description, siteUrl, image, items }
}

export class DbService extends IpcService {
  static override readonly groupName = "db"

  private async buildPreviewData(feedUrl: string, preferredFeedId?: string) {
    const xmlText = await fetchUrl(feedUrl)
    const parsed = parseRss(xmlText)

    const feedId =
      preferredFeedId || `local_feed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const now = Date.now()

    const feed = {
      type: "feed" as const,
      id: feedId,
      url: feedUrl,
      title: parsed.title || "Untitled Feed",
      description: parsed.description || null,
      image: parsed.image || null,
      siteUrl: parsed.siteUrl || null,
      errorAt: null,
      ownerUserId: null,
      errorMessage: null,
      subscriptionCount: null,
      updatesPerWeek: null,
      latestEntryPublishedAt: null,
      tipUserIds: null,
      updatedAt: now,
    }

    const entries = parsed.items.slice(0, 50).map((item) => ({
      id: `local_entry_${now}_${Math.random().toString(36).slice(2, 9)}`,
      feedId,
      title: item.title || "Untitled",
      url: item.url || null,
      content: item.content || null,
      description: item.description || null,
      guid: item.guid,
      author: item.author || null,
      authorUrl: null,
      authorAvatar: null,
      publishedAt: item.publishedAt,
      insertedAt: now,
      media: null,
      categories: null,
      attachments: null,
      extra: null,
      language: null,
      inboxHandle: null,
      readabilityContent: null,
      readabilityUpdatedAt: null,
      sources: null,
      settings: null,
      read: false,
    }))

    return {
      feed,
      entries,
      subscription: undefined,
      analytics: {
        updatesPerWeek: null,
        subscriptionCount: null,
        latestEntryPublishedAt: entries[0]?.publishedAt || null,
        view: 1,
      },
    }
  }

  @IpcMethod()
  async executeRawSql(
    _context: IpcContext,
    sql: string,
    params?: unknown[],
    method?: "run" | "all" | "get" | "values",
  ) {
    const sqlite = DBManager.getSqlite()
    try {
      if (params && params.length > 0) {
        if (method === "get") {
          return { rows: sqlite.prepare(sql).get(params) }
        } else if (method === "run") {
          return sqlite.prepare(sql).run(params)
        }
        return { rows: sqlite.prepare(sql).all(params) }
      } else {
        if (method === "get") {
          return { rows: sqlite.prepare(sql).get() }
        } else if (method === "run") {
          return sqlite.prepare(sql).run()
        }
        return { rows: sqlite.prepare(sql).all() }
      }
    } catch (error: any) {
      console.error(`[DbService] Error executing SQL: ${sql} with params:`, params, error)
      return { rows: [] }
    }
  }

  @IpcMethod()
  async getFeeds(_context: IpcContext) {
    const db = DBManager.getDB()
    return db.query.feedsTable.findMany()
  }

  @IpcMethod()
  async getEntry(_context: IpcContext, entryId: string) {
    const db = DBManager.getDB()
    return (
      db.query.entriesTable.findFirst({
        where: (entries, { eq }) => eq(entries.id, entryId),
      }) ?? null
    )
  }

  @IpcMethod()
  async getEntries(_context: IpcContext, feedId?: string) {
    const db = DBManager.getDB()
    if (feedId) {
      return db.query.entriesTable.findMany({
        where: (entries, { eq }) => eq(entries.feedId, feedId),
        orderBy: (entries, { desc }) => [desc(entries.publishedAt)],
      })
    }
    return db.query.entriesTable.findMany({
      orderBy: (entries, { desc }) => [desc(entries.publishedAt)],
    })
  }

  @IpcMethod()
  async getUnreadCount(_context: IpcContext) {
    return 0
  }

  @IpcMethod()
  async previewFeed(_context: IpcContext, form: { url: string; feedId?: string }) {
    return this.buildPreviewData(form.url, form.feedId)
  }

  @IpcMethod()
  async addFeed(
    _context: IpcContext,
    form: { url: string; view: number; category?: string; title?: string },
  ) {
    try {
      const feedUrl = form.url
      console.info(`[DbService] Fetching RSS: ${feedUrl}`)

      // 1. Build preview payload via local fetch/parse pipeline
      const preview = await this.buildPreviewData(feedUrl)
      const feed = {
        ...preview.feed,
        title: form.title || preview.feed.title,
      }
      const feedId = feed.id
      await FeedService.upsertMany([feed] as any)

      // 2. Build subscription row
      const subId = `local_sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const subscription = {
        id: subId,
        feedId,
        userId: "local_user_id",
        view: form.view,
        isPrivate: false,
        hideFromTimeline: false,
        title: form.title || preview.feed.title || null,
        category: form.category || null,
        type: "feed" as const,
        listId: null,
        inboxId: null,
        createdAt: new Date().toISOString(),
      }
      await SubscriptionService.upsertMany([subscription] as any)

      // 3. Persist preview entries (up to 50 latest)
      const { entries } = preview

      if (entries.length > 0) {
        await EntryService.upsertMany(entries as any)
      }

      console.info(`[DbService] Feed added: ${feed.title}, ${entries.length} entries persisted`)

      // 5. Return complete data so the renderer can hydrate the in-memory store immediately
      return {
        feed: { ...feed, type: "feed" as const },
        subscription,
        entries, // renderer will call entryActions.upsertManyInSession(entries)
      }
    } catch (e: any) {
      console.error("[DbService] addFeed error:", e)
      throw new Error(`Failed to add feed: ${e.message}`)
    }
  }
}
