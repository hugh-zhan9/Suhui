import * as http from "node:http"
import * as https from "node:https"

import { EntryService } from "@follow/database/services/entry"
import { FeedService } from "@follow/database/services/feed"
import { SubscriptionService } from "@follow/database/services/subscription"
import { app } from "electron"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import { store } from "~/lib/store"
import { DBManager } from "~/manager/db"
import { loadLiteSupportedRoutes } from "~/manager/rsshub-lite-routes"
import { rsshubManager } from "~/manager/rsshub"

import { findDuplicateFeed } from "./rss-dedup"
import { buildEntryMediaPayload } from "./rss-entry-media"
import { resolveHttpErrorMessage } from "./rss-http-error"
import { parseRssFeed } from "./rss-parser"
import { buildEntryIdentityKey, buildRefreshedFeed, buildStableLocalEntryId } from "./rss-refresh"
import { extractRsshubCustomHosts } from "./rsshub-custom-host"
import { resolveRsshubUrl, shouldUseLocalRsshubRuntime } from "./rsshub-url"

/**
 * Fetches a URL using Node.js built-in http/https, follows up to 5 redirects.
 */
function fetchUrl(url: string, rsshubToken?: string | null, redirectCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Too many redirects"))
      return
    }
    const lib = url.startsWith("https") ? https : http
    const headers: Record<string, string> = {
      "User-Agent": "FreeFolo RSS Reader/1.0",
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
          resolve(fetchUrl(resolvedLocation, rsshubToken, redirectCount + 1))
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
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
        res.on("error", reject)
      })
      .on("error", reject)
  })
}

export class DbService extends IpcService {
  static override readonly groupName = "db"

  private async buildPreviewData(feedUrl: string, preferredFeedId?: string) {
    const customHosts = extractRsshubCustomHosts(store.get("rsshubCustomUrl"))

    if (shouldUseLocalRsshubRuntime(feedUrl, customHosts)) {
      await rsshubManager.ensureRunning()
    }

    const { resolvedUrl, token } = resolveRsshubUrl({
      url: feedUrl,
      state: rsshubManager.getState(),
      customHosts,
    })
    const xmlText = await fetchUrl(resolvedUrl, token)
    const parsed = parseRssFeed(xmlText)

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
          return { rows: sqlite.prepare(sql).raw().get(params) }
        } else if (method === "run") {
          return sqlite.prepare(sql).run(params)
        }
        return { rows: sqlite.prepare(sql).raw().all(params) }
      } else {
        if (method === "get") {
          return { rows: sqlite.prepare(sql).raw().get() }
        } else if (method === "run") {
          return sqlite.prepare(sql).run()
        }
        return { rows: sqlite.prepare(sql).raw().all() }
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
  async updateReadStatus(_context: IpcContext, payload: { entryIds: string[]; read: boolean }) {
    const { entryIds, read } = payload
    if (!entryIds || entryIds.length === 0) return
    await EntryService.patchMany({ entry: { read }, entryIds })
    console.info(`[DbService] Updated read=${read} for ${entryIds.length} entries`)
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
      const db = DBManager.getDB()

      const existingFeeds = await db.query.feedsTable.findMany({
        columns: { id: true, url: true, siteUrl: true },
      })

      const preview = await this.buildPreviewData(feedUrl)
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

      // 3. Persist preview entries (up to 50 latest)
      const { entries } = preview

      if (entries.length > 0) {
        const entriesToSave = entries.map((entry) => ({
          ...entry,
          publishedAt: new Date(entry.publishedAt),
          insertedAt: new Date(entry.insertedAt),
          readabilityUpdatedAt: entry.readabilityUpdatedAt
            ? new Date(entry.readabilityUpdatedAt)
            : null,
        }))
        await EntryService.upsertMany(entriesToSave as any)
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
  async refreshFeed(_context: IpcContext, feedId: string) {
    const db = DBManager.getDB()
    const existingFeed = await db.query.feedsTable.findFirst({
      where: (feeds, { eq }) => eq(feeds.id, feedId),
    })
    if (!existingFeed?.url) {
      throw new Error(`Feed not found: ${feedId}`)
    }

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
        publishedAt: new Date(entry.publishedAt),
        insertedAt: new Date(entry.insertedAt),
        readabilityUpdatedAt: entry.readabilityUpdatedAt
          ? new Date(entry.readabilityUpdatedAt)
          : null,
      }))
      await EntryService.upsertMany(entriesToSave as any)
    }

    return {
      feed: refreshedFeed,
      entriesCount: entries.length,
    }
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
    try {
      await SubscriptionService.deleteByTargets(targets)
    } catch (e: any) {
      console.error("[DbService] deleteSubscriptionByTargets error:", e)
      throw new Error(`Failed to delete subscriptions: ${e.message}`)
    }
  }

  @IpcMethod()
  async getRsshubStatus(_context: IpcContext) {
    const state = rsshubManager.getState()
    const liteSupportedRoutes = loadLiteSupportedRoutes({
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
    })
    return {
      status: state.status,
      port: state.port,
      retryCount: state.retryCount,
      cooldownUntil: state.cooldownUntil,
      runtimeMode: rsshubManager.getRuntimeMode(),
      liteSupportedRoutes,
    }
  }

  @IpcMethod()
  async toggleRsshub(_context: IpcContext, enabled: boolean) {
    if (enabled) {
      return rsshubManager.start()
    }
    return rsshubManager.stop()
  }

  @IpcMethod()
  async restartRsshub(_context: IpcContext) {
    return rsshubManager.restart()
  }
}
