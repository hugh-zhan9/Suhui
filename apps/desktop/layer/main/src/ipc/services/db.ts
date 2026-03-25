import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import { DBManager } from "~/manager/db"
import { FeedRefreshService } from "~/manager/feed-refresh"
import { syncLogger } from "~/manager/sync-logger"

import { mapExecuteResult } from "./db-execute-result"
import { findDuplicateFeed } from "./rss-dedup"

export class DbService extends IpcService {
  static override readonly groupName = "db"

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
  async updateReadStatus(_context: IpcContext, payload: { entryIds: string[]; read: boolean }) {
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
      return await FeedRefreshService.buildPreviewData(
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
    try {
      const feedUrl = form.url
      console.info(`[DbService] Fetching RSS: ${feedUrl}`)
      const db = DBManager.getDB()

      const existingFeeds = await db.query.feedsTable.findMany({
        columns: { id: true, url: true, siteUrl: true },
      })

      const preview = await FeedRefreshService.buildPreviewData(feedUrl)
      const duplicateFeed = findDuplicateFeed(existingFeeds as any, feedUrl, preview.feed.siteUrl)

      if (duplicateFeed) {
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

  @IpcMethod()
  async refreshAll(_context: IpcContext) {
    return FeedRefreshService.refreshAll()
  }

  @IpcMethod()
  async refreshFeed(_context: IpcContext, feedId: string) {
    return FeedRefreshService.refreshFeed(feedId)
  }

  @IpcMethod()
  async deleteSubscriptionByTargets(
    _context: IpcContext,
    targets: { ids: string[]; feedIds: string[]; listIds: string[]; inboxIds: string[] },
  ) {
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
