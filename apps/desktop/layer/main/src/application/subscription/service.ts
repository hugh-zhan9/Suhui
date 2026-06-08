import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import { InboxService } from "@suhui/database/services/inbox"
import { ListService } from "@suhui/database/services/list"
import { SubscriptionService } from "@suhui/database/services/subscription"
import { and, eq, inArray, isNull, or } from "drizzle-orm"

import { findDuplicateFeed } from "~/ipc/services/rss-dedup"
import { resolvePublishedAtMs, toTimestampMs } from "~/ipc/services/rss-time"
import { DBManager } from "~/manager/db"
import { FeedRefreshService } from "~/manager/feed-refresh"
import { syncLogger } from "~/manager/sync-logger"

type CreateSubscriptionPayload = {
  url: string
  view: number
  category?: string
  title?: string
}

type DeleteTargetsPayload = {
  ids?: string[]
  feedIds?: string[]
  listIds?: string[]
  inboxIds?: string[]
}

export class SubscriptionApplicationService {
  async listSubscriptions() {
    const subscriptions = await SubscriptionService.getSubscriptionAll()

    const [feeds, lists, inboxes] = await Promise.all([
      FeedService.getFeedAll(),
      ListService.getListAll(),
      InboxService.getInboxAll(),
    ])

    const feedTitleById = new Map(feeds.map((feed) => [feed.id, feed.title ?? null]))
    const listTitleById = new Map(lists.map((list) => [list.id, list.title ?? null]))
    const inboxTitleById = new Map(inboxes.map((inbox) => [inbox.id, inbox.title ?? null]))

    return subscriptions.map((subscription) => {
      if (subscription.title) return subscription

      let fallbackTitle: string | null = null

      if (subscription.type === "feed" && subscription.feedId) {
        fallbackTitle = feedTitleById.get(subscription.feedId) ?? null
      } else if (subscription.type === "list" && subscription.listId) {
        fallbackTitle = listTitleById.get(subscription.listId) ?? null
      } else if (subscription.type === "inbox" && subscription.inboxId) {
        fallbackTitle = inboxTitleById.get(subscription.inboxId) ?? null
      }

      return {
        ...subscription,
        title: fallbackTitle,
      }
    })
  }

  async createSubscription(payload: CreateSubscriptionPayload) {
    const feedUrl = (payload.url || "").trim()
    if (!feedUrl) {
      throw new Error("Feed URL is required")
    }

    const db = DBManager.getDB()
    const existingFeeds = await db.query.feedsTable.findMany({
      where: (feeds) => isNull(feeds.deletedAt),
      columns: { id: true, url: true, siteUrl: true },
    })

    const preview = await FeedRefreshService.buildPreviewData(feedUrl)
    const duplicateFeed = findDuplicateFeed(existingFeeds as any, feedUrl, preview.feed.siteUrl)

    if (duplicateFeed) {
      const existingFeed = await db.query.feedsTable.findFirst({
        where: (feeds) => and(eq(feeds.id, duplicateFeed.id), isNull(feeds.deletedAt)),
      })
      const existingSubscription = await db.query.subscriptionsTable.findFirst({
        where: (subscriptions) =>
          and(
            eq(subscriptions.feedId, duplicateFeed.id),
            eq(subscriptions.type, "feed"),
            isNull(subscriptions.deletedAt),
          ),
      })

      const subscription =
        existingSubscription ??
        ({
          id: `feed/${duplicateFeed.id}`,
          feedId: duplicateFeed.id,
          userId: "local_user_id",
          view: payload.view,
          isPrivate: false,
          hideFromTimeline: false,
          title: payload.title || existingFeed?.title || null,
          category: payload.category || null,
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
        where: (entries) => and(eq(entries.feedId, duplicateFeed.id), isNull(entries.deletedAt)),
        orderBy: (entries, { desc }) => [desc(entries.publishedAt)],
        limit: 50,
      })

      return {
        feed: existingFeed,
        subscription,
        entries,
      }
    }

    const feed = {
      ...preview.feed,
      title: payload.title || preview.feed.title,
      updatedAt: toTimestampMs(preview.feed.updatedAt) ?? Date.now(),
    }
    await FeedService.upsertMany([feed] as any)

    const subscription = {
      id: `feed/${feed.id}`,
      feedId: feed.id,
      userId: "local_user_id",
      view: payload.view,
      isPrivate: false,
      hideFromTimeline: false,
      title: payload.title || preview.feed.title || null,
      category: payload.category || null,
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

    const entries = preview.entries.map((entry) => ({
      ...entry,
      publishedAt: resolvePublishedAtMs(entry.publishedAt),
      insertedAt: toTimestampMs(entry.insertedAt) ?? Date.now(),
      readabilityUpdatedAt: toTimestampMs(entry.readabilityUpdatedAt),
    }))
    await EntryService.upsertMany(entries as any)

    return {
      feed: { ...feed, type: "feed" as const },
      subscription,
      entries: preview.entries,
    }
  }

  async deleteSubscription(subscriptionId: string) {
    if (!subscriptionId) return

    await SubscriptionService.delete(subscriptionId)
  }

  async updateSubscription(
    subscriptionId: string,
    payload: {
      title?: string | null
      category?: string | null
      view?: number
    },
  ) {
    await SubscriptionService.patch({
      id: subscriptionId,
      ...payload,
    })

    return SubscriptionService.getSubscriptionAll().then(
      (subscriptions) =>
        subscriptions.find((subscription) => subscription.id === subscriptionId) || null,
    )
  }

  async batchUpdateSubscriptions(payload: {
    feedIds: string[]
    category?: string | null
    view?: number
  }) {
    const feedIds = Array.from(new Set((payload.feedIds || []).filter(Boolean)))
    if (feedIds.length === 0) return

    await SubscriptionService.patchMany({
      feedIds,
      data: {
        ...(typeof payload.view === "number" ? { view: payload.view } : {}),
        ...(payload.category !== undefined ? { category: payload.category } : {}),
      },
    } as any)
  }

  async deleteSubscriptionsByTargets(targets: DeleteTargetsPayload) {
    const normalizedTargets = {
      ids: targets.ids ?? [],
      feedIds: targets.feedIds ?? [],
      listIds: targets.listIds ?? [],
      inboxIds: targets.inboxIds ?? [],
    }
    const totalTargets =
      normalizedTargets.ids.length +
      normalizedTargets.feedIds.length +
      normalizedTargets.listIds.length +
      normalizedTargets.inboxIds.length
    if (totalTargets === 0) return

    const db = DBManager.getDB()
    const conditions = [
      normalizedTargets.ids.length > 0
        ? (subscriptions: any) => inArray(subscriptions.id, normalizedTargets.ids)
        : undefined,
      normalizedTargets.feedIds.length > 0
        ? (subscriptions: any) => inArray(subscriptions.feedId, normalizedTargets.feedIds)
        : undefined,
      normalizedTargets.listIds.length > 0
        ? (subscriptions: any) => inArray(subscriptions.listId, normalizedTargets.listIds)
        : undefined,
      normalizedTargets.inboxIds.length > 0
        ? (subscriptions: any) => inArray(subscriptions.inboxId, normalizedTargets.inboxIds)
        : undefined,
    ].filter(Boolean) as Array<(subscriptions: any) => any>
    const idsToDelete = await db.query.subscriptionsTable.findMany({
      where: (subscriptions) =>
        and(
          conditions.length === 1
            ? conditions[0]!(subscriptions)
            : or(...conditions.map((condition) => condition(subscriptions))),
          isNull(subscriptions.deletedAt),
        ),
      columns: { id: true },
    })

    await SubscriptionService.deleteByTargets(normalizedTargets)

    for (const id of new Set(idsToDelete.map((subscription) => subscription.id))) {
      syncLogger.record({
        type: "subscription.remove",
        entityType: "subscription",
        entityId: id,
      })
    }
  }
}

export const subscriptionApplicationService = new SubscriptionApplicationService()
