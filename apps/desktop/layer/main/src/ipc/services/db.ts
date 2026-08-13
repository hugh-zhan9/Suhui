import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm"
import { randomUUID } from "node:crypto"

import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import { createEntryChangeEventV1 } from "@suhui/shared/entry-change"
import { session } from "electron"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import { store } from "~/lib/store"
import { localReadingPipeline } from "~/application/local-reading/pipeline"
import { entryApplicationService } from "~/application/entry/service"
import { entryQueryService } from "~/application/entry/query-service"
import type { EntryListQuery } from "~/application/entry/query-types"
import { feedApplicationService } from "~/application/feed/service"
import { subscriptionApplicationService } from "~/application/subscription/service"
import { DBManager } from "~/manager/db"
import { drainPendingOps } from "~/manager/sync-applier"
import { logger } from "~/logger"
import { debugStartupReadTrace } from "~/startup-read-trace"
import { appendRefreshAuditTrace } from "~/manager/refresh-audit-log"
import { broadcastLocalFeedRefreshCompleted } from "~/manager/local-feed-refresh-events"

import { mapExecuteResult } from "./db-execute-result"
import { fetchFeedUrl } from "./feed-fetch"
import {
  isLocalFeedRefreshCandidate,
  localFeedRefreshBatchConcurrency,
  localFeedRefreshRequestTimeoutMs,
} from "./local-feed-refresh"
import { buildEntryMediaPayload } from "./rss-entry-media"
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

const collectSuccessfulBatchFeedIds = (results: BatchRefreshResult[]) => {
  const seen = new Set<string>()
  const feedIds: string[] = []
  for (const result of results) {
    const feedId = result.feedId.trim()
    if (!result.ok || !feedId || seen.has(feedId)) continue
    seen.add(feedId)
    feedIds.push(feedId)
  }
  return feedIds
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
  const event = appendRefreshAuditTrace(trace, level, stage, extra)
  logger[level]("[RefreshTrace]", event)
}

const recordRefreshBatchEventCount = (batchId: string, value: 0 | 1) => {
  logger.info("[PerformanceMetric]", {
    metric: "refresh_batch_event_count",
    batchId,
    value,
  })
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

export class DbService extends IpcService {
  static override readonly groupName = "db"

  private async waitForDatabase() {
    await DBManager.waitUntilUsable()
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
        resolveProxy: (url) => session.defaultSession.resolveProxy(url),
      })
      console.info("[db.previewFeed] diagnostics", beforeDiagnostics)
    }

    const fetchResult = await fetchFeedUrl(resolvedUrl, {
      timeoutMs: localFeedRefreshRequestTimeoutMs,
      onResponse: ({ requestUrl, statusCode, location }) => {
        if (trace) {
          refreshLog("info", trace, "fetch.response", {
            requestUrl,
            statusCode,
            location,
          })
        }
      },
      onError: ({ requestUrl, error }) => {
        if (!trace) return
        const stage = error.message.includes("timed out")
          ? "fetch.request_timeout"
          : "fetch.request_error"
        refreshLog("error", trace, stage, {
          requestUrl,
          reason: error.message,
          timeoutMs:
            stage === "fetch.request_timeout" ? localFeedRefreshRequestTimeoutMs : undefined,
        })
      },
    })

    if (trace) {
      refreshLog("info", trace, "fetch.completed", {
        finalUrl: fetchResult.finalUrl,
        redirectCount: fetchResult.redirectChain.length,
        redirectChain: fetchResult.redirectChain,
        statusCode: fetchResult.statusCode || null,
        bodyBytes: Buffer.byteLength(fetchResult.body, "utf-8"),
      })
    }

    if (diagnosticsEnabled) {
      const afterDiagnostics = await buildPreviewDiagnostics({
        phase: "after",
        inputUrl: feedUrl,
        requestedUrl: resolvedUrl,
        finalUrl: fetchResult.finalUrl,
        redirectChain: fetchResult.redirectChain,
        resolveProxy: (url) => session.defaultSession.resolveProxy(url),
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
    return db.query.feedsTable.findMany({
      where: (feeds) => isNull(feeds.deletedAt),
    })
  }

  @IpcMethod()
  async getSubscriptions(_context: IpcContext) {
    await this.waitForDatabase()
    return subscriptionApplicationService.listSubscriptions()
  }

  @IpcMethod()
  async getEntry(_context: IpcContext, entryId: string) {
    await this.waitForDatabase()
    return entryQueryService.getDetail(entryId, "desktop-non-deleted")
  }

  @IpcMethod()
  async listEntries(_context: IpcContext, query: EntryListQuery) {
    await this.waitForDatabase()
    return entryQueryService.list(query)
  }

  @IpcMethod()
  async getEntries(_context: IpcContext, feedId?: string) {
    await this.waitForDatabase()
    const result = await entryQueryService.list({
      scope: feedId ? { kind: "feeds", feedIds: [feedId] } : { kind: "timeline" },
      limit: 100,
    })
    return result.items
  }

  @IpcMethod()
  async updateReadStatus(_context: IpcContext, payload: { entryIds: string[]; read: boolean }) {
    await this.waitForDatabase()
    const { entryIds, read } = payload
    if (!entryIds || entryIds.length === 0) return
    debugStartupReadTrace(
      "[startup-read-trace] db.updateReadStatus",
      () => ({
        count: entryIds.length,
        read,
        firstIds: entryIds.slice(0, 10),
        stack: new Error().stack,
      }),
      (message, data) => logger.info(message, data),
    )
    await entryApplicationService.updateReadStatus(payload)
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
      return await feedApplicationService.previewFeed({
        url: inputUrl,
        feedId: form.feedId,
        allowPublicRsshub: form?.allowPublicRsshub === true,
      })
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
      refreshLog("info", trace, "add.start", {
        view: form.view,
        category: form.category || null,
        customTitle: form.title || null,
      })
      const result = await subscriptionApplicationService.createSubscription(form)
      refreshLog("info", trace, "add.completed", {
        feedId: (result as any)?.feed?.id || null,
        title: (result as any)?.feed?.title || null,
        entryCount: (result as any)?.entries?.length ?? 0,
      })
      return result
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
        where: (feeds) => and(eq(feeds.id, feedId), isNull(feeds.deletedAt)),
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
          where: (entriesTable) =>
            and(eq(entriesTable.feedId, feedId), isNull(entriesTable.deletedAt)),
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
        const newEntryIds = entriesToSave
          .filter((entry) => !existingReuseIndex.readById.has(entry.id))
          .map((entry) => entry.id)
        await localReadingPipeline.processNewEntries(newEntryIds)
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

      const refreshResult = {
        feed: refreshedFeed,
        entriesCount: entries.length,
      }
      if (meta?.batchTraceId) return refreshResult

      const changeSet = createEntryChangeEventV1({
        batchId: trace.traceId,
        reason: "refresh",
        source: trace.source,
        scope: "feeds",
        feedIds: [feedId],
        refreshed: 1,
        failed: 0,
        completedAt: Date.now(),
        feedId,
      })
      broadcastLocalFeedRefreshCompleted(changeSet)
      recordRefreshBatchEventCount(changeSet.batchId, 1)
      return {
        ...refreshResult,
        batchId: changeSet.batchId,
        changeSet,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      try {
        const db = DBManager.getDB()
        const existingFeed = await db.query.feedsTable.findFirst({
          where: (feeds) => and(eq(feeds.id, feedId), isNull(feeds.deletedAt)),
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
      where: (subscriptions) =>
        and(
          eq(subscriptions.type, "feed"),
          isNotNull(subscriptions.feedId),
          isNull(subscriptions.deletedAt),
        ),
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
      const batchResult = { total: 0, refreshed: 0, failed: 0, results: [] as BatchRefreshResult[] }
      const changeSet = createEntryChangeEventV1({
        batchId: batchTrace.traceId,
        reason: "refresh",
        source: batchTrace.source,
        scope: "feeds",
        feedIds: [],
        refreshed: 0,
        failed: 0,
        completedAt: Date.now(),
      })
      refreshLog("info", batchTrace, "batch.no_subscriptions", {
        batchId: changeSet.batchId,
        refresh_batch_event_count: 0,
      })
      recordRefreshBatchEventCount(changeSet.batchId, 0)
      return { ...batchResult, batchId: changeSet.batchId, changeSet }
    }
    refreshLog("info", batchTrace, "batch.subscription_ids_loaded", {
      subscribedFeedCount: feedIds.length,
    })

    const feeds = await db.query.feedsTable.findMany({
      where: (feeds) => and(inArray(feeds.id, feedIds), isNull(feeds.deletedAt)),
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

    const batchResult = {
      total: localFeeds.length,
      refreshed: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results,
    }
    const changeSet = createEntryChangeEventV1({
      batchId: batchTrace.traceId,
      reason: "refresh",
      source: batchTrace.source,
      scope: "feeds",
      feedIds: collectSuccessfulBatchFeedIds(batchResult.results),
      refreshed: batchResult.refreshed,
      failed: batchResult.failed,
      completedAt: Date.now(),
    })
    const refreshBatchEventCount = changeSet.feedIds.length > 0 ? 1 : 0
    refreshLog("info", batchTrace, "batch.completed", {
      batchId: changeSet.batchId,
      total: localFeeds.length,
      refreshed: batchResult.refreshed,
      failed: batchResult.failed,
      durationMs: Date.now() - batchStartedAt,
      refresh_batch_event_count: refreshBatchEventCount,
    })
    if (refreshBatchEventCount === 1) {
      broadcastLocalFeedRefreshCompleted(changeSet)
    }
    recordRefreshBatchEventCount(changeSet.batchId, refreshBatchEventCount)
    return {
      ...batchResult,
      batchId: changeSet.batchId,
      changeSet,
    }
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
    try {
      await subscriptionApplicationService.deleteSubscriptionsByTargets(targets)
      return
    } catch (e: any) {
      console.error("[DbService] deleteSubscriptionByTargets error:", e)
      throw new Error(`Failed to delete subscriptions: ${e.message}`)
    }
  }

  @IpcMethod()
  async updateSubscription(
    _context: IpcContext,
    subscriptionId: string,
    payload: { title?: string | null; category?: string | null; view?: number },
  ) {
    await this.waitForDatabase()
    return subscriptionApplicationService.updateSubscription(subscriptionId, payload)
  }

  @IpcMethod()
  async batchUpdateSubscriptions(
    _context: IpcContext,
    payload: { feedIds: string[]; category?: string | null; view?: number },
  ) {
    await this.waitForDatabase()
    await subscriptionApplicationService.batchUpdateSubscriptions(payload)
  }
}
