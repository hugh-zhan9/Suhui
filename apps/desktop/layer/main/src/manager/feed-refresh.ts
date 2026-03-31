import * as http from "node:http"
import * as https from "node:https"

import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"

import { store } from "~/lib/store"
import { DBManager } from "~/manager/db"
import { drainPendingOps } from "~/manager/sync-applier"

import { buildPreviewDiagnostics } from "../ipc/services/preview-feed-diagnostics"
import { buildEntryMediaPayload } from "../ipc/services/rss-entry-media"
import { resolveHttpErrorMessage } from "../ipc/services/rss-http-error"
import { parseRssFeed } from "../ipc/services/rss-parser"
import {
  buildEntryIdentityKey,
  buildFailedFeed,
  buildRefreshedFeed,
  buildStableLocalEntryId,
} from "../ipc/services/rss-refresh"
import { toTimestampMs } from "../ipc/services/rss-time"
import { resolvePreviewFeedUrl } from "../ipc/services/rsshub-external"

/**
 * Fetches a URL using Node.js built-in http/https, follows up to 5 redirects.
 */
type FetchResult = {
  body: string
  finalUrl: string
  redirectChain: string[]
  remoteAddress?: string
  remotePort?: number
}

function fetchUrl(
  url: string,
  rsshubToken?: string | null,
  redirectCount = 0,
  redirectVisited = new Set<string>(),
  redirectChain: string[] = [],
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 12) {
      reject(new Error("Too many redirects"))
      return
    }
    const lib = url.startsWith("https") ? https : http
    const headers: Record<string, string> = {
      // Node.js request header values must be ASCII-only.
      "User-Agent": "Suhui-RSS-Reader/1.0",
      Accept: "application/rss+xml, application/atom+xml, application/xml, */*",
    }
    if (rsshubToken) {
      headers["X-RSSHub-Token"] = rsshubToken
    }
    lib
      .get(url, { headers }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const resolvedLocation = new URL(res.headers.location, url).toString()
          if (redirectVisited.has(resolvedLocation)) {
            reject(new Error(`Redirect loop detected: ${resolvedLocation}`))
            return
          }
          const nextVisited = new Set(redirectVisited)
          nextVisited.add(resolvedLocation)
          resolve(
            fetchUrl(resolvedLocation, rsshubToken, redirectCount + 1, nextVisited, [
              ...redirectChain,
              resolvedLocation,
            ]),
          )
          return
        }
        if (res.statusCode && res.statusCode >= 400) {
          const chunks: Buffer[] = []
          res.on("data", (chunk) => chunks.push(chunk))
          res.on("end", () => {
            reject(
              new Error(
                resolveHttpErrorMessage(res.statusCode, Buffer.concat(chunks).toString("utf-8")),
              ),
            )
          })
          res.on("error", reject)
          return
        }
        const chunks: Buffer[] = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () =>
          resolve({
            body: Buffer.concat(chunks).toString("utf-8"),
            finalUrl: url,
            redirectChain,
            remoteAddress: res.socket?.remoteAddress,
            remotePort: res.socket?.remotePort,
          }),
        )
        res.on("error", reject)
      })
      .on("error", reject)
  })
}

export class FeedRefreshService {
  public static async buildPreviewData(
    feedUrl: string,
    preferredFeedId?: string,
    allowPublicFallback = false,
    diagnosticsEnabled = false,
  ) {
    const customBaseUrl = (store.get("rsshubCustomUrl") as string) ?? ""
    const resolvedUrl = resolvePreviewFeedUrl(feedUrl, {
      customBaseUrl,
      allowPublicFallback,
    })

    if (diagnosticsEnabled) {
      const beforeDiagnostics = await buildPreviewDiagnostics({
        phase: "before",
        inputUrl: feedUrl,
        requestedUrl: resolvedUrl,
        finalUrl: resolvedUrl,
        redirectChain: [],
      })
      console.info("[FeedRefreshService.buildPreviewData] diagnostics", beforeDiagnostics)
    }

    const fetchResult = await fetchUrl(resolvedUrl)

    if (diagnosticsEnabled) {
      const afterDiagnostics = await buildPreviewDiagnostics({
        phase: "after",
        inputUrl: feedUrl,
        requestedUrl: resolvedUrl,
        finalUrl: fetchResult.finalUrl,
        redirectChain: fetchResult.redirectChain,
        remoteAddress: fetchResult.remoteAddress,
        remotePort: fetchResult.remotePort,
      })
      console.info("[FeedRefreshService.buildPreviewData] diagnostics", afterDiagnostics)
    }

    const parsed = parseRssFeed(fetchResult.body)

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

    const entries = parsed.items.slice(0, 50).map((item) => {
      const mediaPayload = buildEntryMediaPayload({
        content: item.content,
        url: item.url,
      })

      return {
        id: buildStableLocalEntryId({
          feedId,
          guid: item.guid,
          url: item.url,
          title: item.title,
          publishedAt: item.publishedAt,
        }),
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
        media: mediaPayload.media.length > 0 ? mediaPayload.media : null,
        categories: null,
        attachments: mediaPayload.attachments.length > 0 ? mediaPayload.attachments : null,
        extra: null,
        language: null,
        inboxHandle: null,
        readabilityContent: null,
        readabilityUpdatedAt: null,
        sources: null,
        settings: null,
        read: false,
      }
    })

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

  static async refreshFeed(feedId: string) {
    const db = DBManager.getDB()
    const existingFeed = await db.query.feedsTable.findFirst({
      where: (feeds, { eq }) => eq(feeds.id, feedId),
    })
    if (!existingFeed?.url) {
      throw new Error(`Feed not found: ${feedId}`)
    }

    try {
      const preview = await this.buildPreviewData(existingFeed.url, feedId)
      const refreshedFeed = buildRefreshedFeed(existingFeed as any, preview.feed as any)

      await FeedService.upsertMany([refreshedFeed] as any)

      const { entries } = preview
      if (entries.length > 0) {
        const existingEntries = await db.query.entriesTable.findMany({
          where: (entriesTable, { eq }) => eq(entriesTable.feedId, feedId),
          columns: {
            id: true,
            guid: true,
            url: true,
            title: true,
            publishedAt: true,
            read: true,
          },
        })
        const existingIdByKey = new Map<string, string>()
        const existingReadById = new Map<string, boolean>()
        for (const existing of existingEntries) {
          const key = buildEntryIdentityKey(existing as any)
          if (!existingIdByKey.has(key)) {
            existingIdByKey.set(key, existing.id)
          }
          const read =
            typeof existing.read === "boolean"
              ? existing.read
              : existing.read === 1 || existing.read === "1"
          existingReadById.set(existing.id, read)
        }

        const entriesToSave = entries.map((entry) => ({
          ...entry,
          id: existingIdByKey.get(buildEntryIdentityKey(entry as any)) || entry.id,
          read:
            existingReadById.get(existingIdByKey.get(buildEntryIdentityKey(entry as any)) || "") ??
            entry.read,
          publishedAt: toTimestampMs(entry.publishedAt) ?? Date.now(),
          insertedAt: toTimestampMs(entry.insertedAt) ?? Date.now(),
          readabilityUpdatedAt: toTimestampMs(entry.readabilityUpdatedAt),
        }))
        await EntryService.upsertMany(entriesToSave as any)
      }

      // 尝试重试由于前置依赖缺失而 pending 的同步操作（后台执行）
      drainPendingOps().catch((err) => {
        console.error("[FeedRefreshService] error draining pending ops after refresh:", err)
      })

      return {
        feed: refreshedFeed,
        entriesCount: entries.length,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await FeedService.upsertMany([buildFailedFeed(existingFeed as any, reason)] as any)
      throw error
    }
  }

  static async refreshAll() {
    const db = DBManager.getDB()
    const feeds = await db.query.feedsTable.findMany({
      columns: { id: true, url: true },
    })

    const targets = feeds.filter((f) => !!f.url)

    // 控制并发，目前简单使用 Promise.all，可以考虑使用限制并发的库或简单循环
    const results = await Promise.allSettled(targets.map((feed) => this.refreshFeed(feed.id)))

    const successCount = results.filter((r) => r.status === "fulfilled").length
    const failCount = targets.length - successCount

    console.info(
      `[FeedRefreshService.refreshAll] Completed, success=${successCount}, fail=${failCount}, total=${targets.length}`,
    )

    return {
      total: targets.length,
      successCount,
      failCount,
    }
  }
}
