import { randomUUID } from "node:crypto"
import * as http from "node:http"
import * as https from "node:https"

import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import { store } from "~/lib/store"
import { DBManager } from "~/manager/db"
import { drainPendingOps } from "~/manager/sync-applier"
import { syncLogger } from "~/manager/sync-logger"
import { logger } from "~/logger"
import { appendRefreshAuditTrace } from "~/manager/refresh-audit-log"
import { broadcastLocalFeedRefreshCompleted } from "~/manager/local-feed-refresh-events"

import { mapExecuteResult } from "./db-execute-result"
import {
  isLocalFeedRefreshCandidate,
  localFeedRefreshBatchConcurrency,
  localFeedRefreshRequestTimeoutMs,
} from "./local-feed-refresh"
import { findDuplicateFeed } from "./rss-dedup"
import { buildEntryMediaPayload } from "./rss-entry-media"
import { resolveHttpErrorMessage } from "./rss-http-error"
import { parseRssFeed } from "./rss-parser"
import {
  buildExistingEntryReuseIndex,
  buildFailedFeed,
  buildRefreshedFeed,
  buildStableLocalEntryId,
  resolveExistingEntryIdForRefresh,
} from "./rss-refresh"
import { resolvePreviewFeedUrl } from "./rsshub-external"
import { resolvePublishedAtMs, toTimestampMs } from "./rss-time"
import { buildPreviewDiagnostics } from "./preview-feed-diagnostics"

/**
 * Fetches a URL using Node.js built-in http/https, follows up to 5 redirects.
 */
type FetchResult = {
  body: string
  finalUrl: string
  redirectChain: string[]
  remoteAddress?: string
  remotePort?: number
  statusCode?: number
}

type RefreshSource =
  | "manual-single"
  | "manual-batch"
  | "startup-auto"
  | "interval-auto"
  | "internal"

type RefreshTrace = {
  traceId: string
  source: RefreshSource
  mode: "single" | "batch" | "preview" | "add"
  feedId?: string
  feedUrl?: string
  batchTraceId?: string
}

type RefreshInvocationMeta = {
  source?: RefreshSource
  traceId?: string
  batchTraceId?: string
}

type BatchRefreshResult = {
  feedId: string
  ok: boolean
  entriesCount?: number
  error?: string
}

const buildRefreshTrace = (
  mode: RefreshTrace["mode"],
  data: Omit<RefreshTrace, "traceId" | "mode"> & { traceId?: string },
): RefreshTrace => ({
  traceId: data.traceId || randomUUID(),
  source: data.source,
  mode,
  feedId: data.feedId,
  feedUrl: data.feedUrl,
  batchTraceId: data.batchTraceId,
})

const refreshLog = (
  level: "info" | "warn" | "error",
  trace: RefreshTrace,
  stage: string,
  extra: Record<string, unknown> = {},
) => {
  logger[level]("[RefreshTrace]", {
    traceId: trace.traceId,
    batchTraceId: trace.batchTraceId,
    source: trace.source,
    mode: trace.mode,
    feedId: trace.feedId,
    feedUrl: trace.feedUrl,
    stage,
    ...extra,
  })
  appendRefreshAuditTrace(trace, level, stage, extra)
}

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function fetchUrl(
  url: string,
  rsshubToken?: string | null,
  redirectCount = 0,
  redirectVisited = new Set<string>(),
  redirectChain: string[] = [],
  trace?: RefreshTrace,
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 12) {
      if (trace) {
        refreshLog("error", trace, "fetch.too_many_redirects", {
          redirectCount,
          redirectChain,
        })
      }
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
    const request = lib.get(url, { headers }, (res) => {
      if (trace) {
        refreshLog("info", trace, "fetch.response", {
          requestUrl: url,
          statusCode: res.statusCode,
          location: res.headers.location || null,
        })
      }
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const resolvedLocation = new URL(res.headers.location, url).toString()
        if (redirectVisited.has(resolvedLocation)) {
          reject(new Error(`Redirect loop detected: ${resolvedLocation}`))
          return
        }
        const nextVisited = new Set(redirectVisited)
        nextVisited.add(resolvedLocation)
        resolve(
          fetchUrl(
            resolvedLocation,
            rsshubToken,
            redirectCount + 1,
            nextVisited,
            [...redirectChain, resolvedLocation],
            trace,
          ),
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
          statusCode: res.statusCode,
        }),
      )
      res.on("error", reject)
    })
    request.setTimeout(localFeedRefreshRequestTimeoutMs, () => {
      if (trace) {
        refreshLog("error", trace, "fetch.request_timeout", {
          requestUrl: url,
          timeoutMs: localFeedRefreshRequestTimeoutMs,
        })
      }
      request.destroy(
        new Error(`Feed request timed out after ${localFeedRefreshRequestTimeoutMs}ms`),
      )
    })
    request.on("error", (error) => {
      if (trace) {
        refreshLog("error", trace, "fetch.request_error", {
          requestUrl: url,
          reason: error.message,
        })
      }
      reject(error)
    })
  })
}

export class DbService extends IpcService {
  static override readonly groupName = "db"

  private async waitForDatabase() {
    await DBManager.waitUntilReady()
  }

  private async buildPreviewData(
    feedUrl: string,
    preferredFeedId?: string,
    allowPublicFallback = false,
    diagnosticsEnabled = false,
    trace?: RefreshTrace,
  ) {
    const customBaseUrl = store.get("rsshubCustomUrl") ?? ""
    const resolvedUrl = resolvePreviewFeedUrl(feedUrl, {
      customBaseUrl,
      allowPublicFallback,
    })

    if (trace) {
      refreshLog("info", trace, "preview.start", {
        requestedUrl: feedUrl,
        resolvedUrl,
        preferredFeedId: preferredFeedId || null,
        allowPublicFallback,
        diagnosticsEnabled,
      })
    }

    if (diagnosticsEnabled) {
      const beforeDiagnostics = await buildPreviewDiagnostics({
        phase: "before",
        inputUrl: feedUrl,
        requestedUrl: resolvedUrl,
        finalUrl: resolvedUrl,
        redirectChain: [],
      })
      console.info("[db.previewFeed] diagnostics", beforeDiagnostics)
    }

    const fetchResult = await fetchUrl(resolvedUrl, undefined, 0, new Set<string>(), [], trace)

    if (trace) {
      refreshLog("info", trace, "fetch.completed", {
        finalUrl: fetchResult.finalUrl,
        redirectCount: fetchResult.redirectChain.length,
        redirectChain: fetchResult.redirectChain,
        statusCode: fetchResult.statusCode || null,
        bodyBytes: Buffer.byteLength(fetchResult.body, "utf-8"),
        remoteAddress: fetchResult.remoteAddress || null,
        remotePort: fetchResult.remotePort || null,
      })
    }

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
      console.info("[db.previewFeed] diagnostics", afterDiagnostics)
    }

    const parsed = parseRssFeed(fetchResult.body)

    if (trace) {
      refreshLog("info", trace, "parse.completed", {
        parsedTitle: parsed.title || null,
        parsedSiteUrl: parsed.siteUrl || null,
        itemCount: parsed.items.length,
        newestPublishedAt: parsed.items[0]?.publishedAt || null,
      })
    }

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

    if (trace) {
      refreshLog("info", trace, "preview.completed", {
        previewFeedId: feedId,
        previewEntryCount: entries.length,
      })
    }

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
  async getDialect() {
    return DBManager.getDialect()
  }

  @IpcMethod()
  async executeRawSql(
    _context: IpcContext,
    sql: string,
    params?: unknown[],
    method?: "run" | "all" | "get" | "values",
  ) {
    try {
      await this.waitForDatabase()
      const pgPool = DBManager.getPgPool()
      const result = await pgPool.query(sql, (params as any[]) ?? [])
      return mapExecuteResult(method, result)
    } catch (error: any) {
      console.error(`[DbService] Error executing SQL: ${sql} with params:`, params, error)
      return { rows: [] }
    }
  }

  @IpcMethod()
  async getFeeds(_context: IpcContext) {
    await this.waitForDatabase()
    const db = DBManager.getDB()
    return db.query.feedsTable.findMany()
  }

  @IpcMethod()
  async getEntry(_context: IpcContext, entryId: string) {
    await this.waitForDatabase()
    const db = DBManager.getDB()
    return (
      db.query.entriesTable.findFirst({
        where: (entries, { eq }) => eq(entries.id, entryId),
      }) ?? null
    )
  }

  @IpcMethod()
  async getEntries(_context: IpcContext, feedId?: string) {
    await this.waitForDatabase()
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
  async updateReadStatus(_context: IpcContext, payload: { entryIds: string[]; read: boolean }) {
    await this.waitForDatabase()
    const { entryIds, read } = payload
    if (!entryIds || entryIds.length === 0) return
    await EntryService.patchMany({ entry: { read }, entryIds })
    for (const entryId of entryIds) {
      syncLogger.record({
        type: read ? "entry.mark_read" : "entry.mark_unread",
        entityType: "entry",
        entityId: entryId,
      })
    }
    console.info(`[DbService] Updated read=${read} for ${entryIds.length} entries`)
  }

  @IpcMethod()
  async getUnreadCount(_context: IpcContext) {
    await this.waitForDatabase()
    return 0
  }

  @IpcMethod()
  async previewFeed(
    _context: IpcContext,
    form: { url: string; feedId?: string; allowPublicRsshub?: boolean },
  ) {
    const inputUrl = (form?.url || "").trim()
    if (!inputUrl) {
      throw new Error("[db.previewFeed] feed url is required")
    }
    try {
      return await this.buildPreviewData(
        inputUrl,
        form.feedId,
        form?.allowPublicRsshub === true,
        true,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error("[db.previewFeed] failed", {
        url: inputUrl,
        feedId: form?.feedId,
        reason,
      })
      throw new Error(`[db.previewFeed] failed for ${inputUrl}: ${reason}`)
    }
  }

  @IpcMethod()
  async addFeed(
    _context: IpcContext,
    form: { url: string; view: number; category?: string; title?: string },
  ) {
    const trace = buildRefreshTrace("add", {
      source: "internal",
      feedUrl: form.url,
    })
    try {
      await this.waitForDatabase()
      const feedUrl = form.url
      refreshLog("info", trace, "add.start", {
        view: form.view,
        category: form.category || null,
        customTitle: form.title || null,
      })
      const db = DBManager.getDB()

      const existingFeeds = await db.query.feedsTable.findMany({
        columns: { id: true, url: true, siteUrl: true },
      })

      const preview = await this.buildPreviewData(feedUrl, undefined, false, false, trace)
      const duplicateFeed = findDuplicateFeed(existingFeeds as any, feedUrl, preview.feed.siteUrl)

      if (duplicateFeed) {
        refreshLog("info", trace, "add.duplicate_feed_found", {
          duplicateFeedId: duplicateFeed.id,
          duplicateFeedUrl: duplicateFeed.url,
        })
        const existingFeed = await db.query.feedsTable.findFirst({
          where: (feeds, { eq }) => eq(feeds.id, duplicateFeed.id),
        })
        const existingSubscription = await db.query.subscriptionsTable.findFirst({
          where: (subscriptions, { and, eq }) =>
            and(eq(subscriptions.feedId, duplicateFeed.id), eq(subscriptions.type, "feed")),
        })

        const subscription =
          existingSubscription ??
          ({
            id: `feed/${duplicateFeed.id}`,
            feedId: duplicateFeed.id,
            userId: "local_user_id",
            view: form.view,
            isPrivate: false,
            hideFromTimeline: false,
            title: form.title || existingFeed?.title || null,
            category: form.category || null,
            type: "feed" as const,
            listId: null,
            inboxId: null,
            createdAt: new Date().toISOString(),
          } as const)

        if (!existingSubscription) {
          await SubscriptionService.upsertMany([subscription] as any)
          syncLogger.record({
            type: "subscription.add",
            entityType: "subscription",
            entityId: subscription.id,
            payload: subscription,
          })
        }

        const entries = await db.query.entriesTable.findMany({
          where: (entries, { eq }) => eq(entries.feedId, duplicateFeed.id),
          orderBy: (entries, { desc }) => [desc(entries.publishedAt)],
          limit: 50,
        })

        refreshLog("info", trace, "add.duplicate_completed", {
          duplicateFeedId: duplicateFeed.id,
          subscriptionId: subscription.id,
          existingEntryCount: entries.length,
        })

        return {
          feed: existingFeed,
          subscription,
          entries,
        }
      }

      // 1. Build preview payload via local fetch/parse pipeline
      const feed = {
        ...preview.feed,
        title: form.title || preview.feed.title,
        updatedAt: preview.feed.updatedAt ? new Date(preview.feed.updatedAt) : new Date(),
      }
      const feedId = feed.id
      refreshLog("info", trace, "add.persist_feed", {
        feedId,
        title: feed.title,
      })
      await FeedService.upsertMany([feed] as any)

      // 2. Build subscription row
      const subId = `feed/${feedId}`
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
      syncLogger.record({
        type: "subscription.add",
        entityType: "subscription",
        entityId: subscription.id,
        payload: subscription,
      })

      // 3. Persist preview entries (up to 50 latest)
      const { entries } = preview

      if (entries.length > 0) {
        const entriesToSave = entries.map((entry) => ({
          ...entry,
          publishedAt: resolvePublishedAtMs(entry.publishedAt),
          insertedAt: toTimestampMs(entry.insertedAt) ?? Date.now(),
          readabilityUpdatedAt: toTimestampMs(entry.readabilityUpdatedAt),
        }))
        refreshLog("info", trace, "add.persist_entries", {
          entryCount: entriesToSave.length,
        })
        await EntryService.upsertMany(entriesToSave as any)
      }

      refreshLog("info", trace, "add.completed", {
        feedId,
        title: feed.title,
        entryCount: entries.length,
      })

      // 5. Return complete data so the renderer can hydrate the in-memory store immediately
      return {
        feed: { ...feed, type: "feed" as const },
        subscription,
        entries, // renderer will call entryActions.upsertManyInSession(entries)
      }
    } catch (e: any) {
      refreshLog("error", trace, "add.failed", {
        reason: e?.message || String(e),
      })
      throw new Error(`Failed to add feed: ${e.message}`)
    }
  }

  @IpcMethod()
  async refreshFeed(_context: IpcContext, feedId: string, meta?: RefreshInvocationMeta) {
    await this.waitForDatabase()
    const trace = buildRefreshTrace("single", {
      source: meta?.source || "manual-single",
      traceId: meta?.traceId,
      batchTraceId: meta?.batchTraceId,
      feedId,
    })
    try {
      const db = DBManager.getDB()
      refreshLog("info", trace, "refresh.start")
      const existingFeed = await db.query.feedsTable.findFirst({
        where: (feeds, { eq }) => eq(feeds.id, feedId),
        columns: {
          id: true,
          url: true,
          title: true,
          description: true,
          image: true,
          siteUrl: true,
          errorAt: true,
          ownerUserId: true,
          errorMessage: true,
          subscriptionCount: true,
          updatesPerWeek: true,
          latestEntryPublishedAt: true,
          tipUserIds: true,
          updatedAt: true,
        },
      })
      if (!existingFeed?.url) {
        refreshLog("error", trace, "refresh.feed_not_found")
        throw new Error(`Feed not found: ${feedId}`)
      }
      trace.feedUrl = existingFeed.url
      refreshLog("info", trace, "refresh.feed_loaded", {
        title: existingFeed.title || null,
        ownerUserId: existingFeed.ownerUserId || null,
      })

      const preview = await this.buildPreviewData(existingFeed.url, feedId, false, false, trace)
      const refreshedFeed = buildRefreshedFeed(existingFeed as any, preview.feed as any)

      refreshLog("info", trace, "refresh.persist_feed", {
        title: refreshedFeed.title,
      })
      await FeedService.upsertMany([refreshedFeed] as any)

      const { entries } = preview
      refreshLog("info", trace, "refresh.preview_entries_ready", {
        previewEntryCount: entries.length,
      })
      if (entries.length > 0) {
        const existingEntries = await db.query.entriesTable.findMany({
          where: (entriesTable, { eq }) => eq(entriesTable.feedId, feedId),
          columns: {
            id: true,
            guid: true,
            url: true,
            title: true,
            publishedAt: true,
            insertedAt: true,
            read: true,
          },
        })
        const existingReuseIndex = buildExistingEntryReuseIndex(existingEntries as any)

        refreshLog("info", trace, "refresh.existing_entries_loaded", {
          existingEntryCount: existingEntries.length,
        })

        const entriesToSave = entries.map((entry) => {
          const existingEntryId = resolveExistingEntryIdForRefresh(existingReuseIndex, entry as any)
          return {
            ...entry,
            id: existingEntryId || entry.id,
            read: existingReuseIndex.readById.get(existingEntryId || "") ?? entry.read,
            publishedAt: resolvePublishedAtMs(entry.publishedAt),
            insertedAt: toTimestampMs(entry.insertedAt) ?? Date.now(),
            readabilityUpdatedAt: toTimestampMs(entry.readabilityUpdatedAt),
          }
        })
        const reusedEntryCount = entriesToSave.filter((entry) =>
          existingReuseIndex.readById.has(entry.id),
        ).length
        refreshLog("info", trace, "refresh.persist_entries", {
          upsertEntryCount: entriesToSave.length,
          reusedEntryCount,
          newEntryCount: Math.max(entriesToSave.length - reusedEntryCount, 0),
        })
        await EntryService.upsertMany(entriesToSave as any)
      }

      refreshLog("info", trace, "refresh.schedule_pending_ops_drain")
      drainPendingOps().catch((err) => {
        refreshLog("error", trace, "refresh.pending_ops_drain_failed", {
          reason: err instanceof Error ? err.message : String(err),
        })
      })

      refreshLog("info", trace, "refresh.completed", {
        entriesCount: entries.length,
      })

      return {
        feed: refreshedFeed,
        entriesCount: entries.length,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      try {
        const db = DBManager.getDB()
        const existingFeed = await db.query.feedsTable.findFirst({
          where: (feeds, { eq }) => eq(feeds.id, feedId),
          columns: {
            id: true,
            url: true,
            title: true,
            description: true,
            image: true,
            siteUrl: true,
            errorAt: true,
            ownerUserId: true,
            errorMessage: true,
            subscriptionCount: true,
            updatesPerWeek: true,
            latestEntryPublishedAt: true,
            tipUserIds: true,
            updatedAt: true,
          },
        })
        if (existingFeed) {
          await FeedService.upsertMany([buildFailedFeed(existingFeed as any, reason)] as any)
          refreshLog("warn", trace, "refresh.persist_failure_state", {
            reason,
          })
        }
      } catch (persistError) {
        refreshLog("error", trace, "refresh.persist_failure_state_failed", {
          reason: persistError instanceof Error ? persistError.message : String(persistError),
        })
      }
      refreshLog("error", trace, "refresh.failed", {
        reason,
      })
      throw error
    }
  }

  @IpcMethod()
  async refreshLocalSubscribedFeeds(_context: IpcContext, meta?: RefreshInvocationMeta) {
    await this.waitForDatabase()
    const batchTrace = buildRefreshTrace("batch", {
      source: meta?.source || "manual-batch",
      traceId: meta?.traceId,
      batchTraceId: meta?.batchTraceId,
    })
    const batchStartedAt = Date.now()
    const db = DBManager.getDB()
    refreshLog("info", batchTrace, "batch.start")
    const subscriptions = await db.query.subscriptionsTable.findMany({
      where: (subscriptions, { and, eq, isNotNull }) =>
        and(eq(subscriptions.type, "feed"), isNotNull(subscriptions.feedId)),
      columns: {
        feedId: true,
      },
    })

    const feedIds = Array.from(
      new Set(
        subscriptions
          .map((subscription) => subscription.feedId)
          .filter((feedId): feedId is string => !!feedId),
      ),
    )

    if (feedIds.length === 0) {
      refreshLog("info", batchTrace, "batch.no_subscriptions")
      return { total: 0, refreshed: 0, failed: 0, results: [] as any[] }
    }
    refreshLog("info", batchTrace, "batch.subscription_ids_loaded", {
      subscribedFeedCount: feedIds.length,
    })

    const feeds = await db.query.feedsTable.findMany({
      where: (feeds, { inArray }) => inArray(feeds.id, feedIds),
      columns: {
        id: true,
        url: true,
        ownerUserId: true,
      },
    })

    const localFeeds = feeds.filter((feed) =>
      isLocalFeedRefreshCandidate({
        url: feed.url,
        ownerUserId: feed.ownerUserId,
      }),
    )
    refreshLog("info", batchTrace, "batch.refresh_candidates_resolved", {
      candidateCount: localFeeds.length,
      skippedCount: feeds.length - localFeeds.length,
    })

    refreshLog("info", batchTrace, "batch.concurrency_config", {
      concurrency: localFeedRefreshBatchConcurrency,
      requestTimeoutMs: localFeedRefreshRequestTimeoutMs,
    })

    const results: BatchRefreshResult[] = []
    let cursor = 0
    const runNext = async (): Promise<void> => {
      const current = localFeeds[cursor++]
      if (!current) return

      try {
        refreshLog("info", batchTrace, "batch.feed_start", {
          targetFeedId: current.id,
          targetFeedUrl: current.url || null,
        })
        const result = await withTimeout(
          this.refreshFeed(_context, current.id, {
            source: batchTrace.source,
            batchTraceId: batchTrace.traceId,
          }),
          localFeedRefreshRequestTimeoutMs + 5_000,
          `refreshFeed(${current.id})`,
        )
        results.push({
          feedId: current.id,
          ok: true,
          entriesCount: result.entriesCount,
        })
        refreshLog("info", batchTrace, "batch.feed_completed", {
          targetFeedId: current.id,
          entriesCount: result.entriesCount,
        })
      } catch (error) {
        results.push({
          feedId: current.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
        refreshLog("error", batchTrace, "batch.feed_failed", {
          targetFeedId: current.id,
          reason: error instanceof Error ? error.message : String(error),
        })
      }

      await runNext()
    }

    await Promise.all(
      Array.from({ length: Math.min(localFeedRefreshBatchConcurrency, localFeeds.length) }, () =>
        runNext(),
      ),
    )

    refreshLog("info", batchTrace, "batch.completed", {
      total: localFeeds.length,
      refreshed: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      durationMs: Date.now() - batchStartedAt,
    })
    const batchResult = {
      total: localFeeds.length,
      refreshed: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results,
    }
    if (
      batchTrace.source === "manual-batch" ||
      batchTrace.source === "startup-auto" ||
      batchTrace.source === "interval-auto"
    ) {
      broadcastLocalFeedRefreshCompleted({
        source: batchTrace.source,
        result: batchResult,
      })
    }
    return batchResult
  }

  @IpcMethod()
  async deleteSubscriptionByTargets(
    _context: IpcContext,
    targets: { ids: string[]; feedIds: string[]; listIds: string[]; inboxIds: string[] },
  ) {
    await this.waitForDatabase()
    const totalTargets =
      (targets.ids?.length ?? 0) +
      (targets.feedIds?.length ?? 0) +
      (targets.listIds?.length ?? 0) +
      (targets.inboxIds?.length ?? 0)
    if (totalTargets === 0) return
    console.info(`[DbService] Deleting subscriptions, targets=${totalTargets}`)
    const db = DBManager.getDB()
    const idsToDelete = [...(targets.ids || [])]
    if (targets.feedIds?.length) {
      const subs = await db.query.subscriptionsTable.findMany({
        where: (subscriptions, { inArray }) => inArray(subscriptions.feedId, targets.feedIds),
        columns: { id: true },
      })
      idsToDelete.push(...subs.map((s) => s.id))
    }

    try {
      await SubscriptionService.deleteByTargets(targets)

      for (const id of new Set(idsToDelete)) {
        syncLogger.record({
          type: "subscription.remove",
          entityType: "subscription",
          entityId: id,
        })
      }
    } catch (e: any) {
      console.error("[DbService] deleteSubscriptionByTargets error:", e)
      throw new Error(`Failed to delete subscriptions: ${e.message}`)
    }
  }
}
