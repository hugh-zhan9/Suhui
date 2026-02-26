import type { FeedViewType } from "@follow/constants"
import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm"

import { db } from "../db"
import {
  collectionsTable,
  entriesTable,
  feedsTable,
  inboxesTable,
  listsTable,
  subscriptionsTable,
  summariesTable,
  translationsTable,
} from "../schemas"
import type { SubscriptionSchema } from "../schemas/types"
import type { Resetable } from "./internal/base"
import { UnreadService } from "./unread"

type DeleteTargets = {
  ids?: string[]
  feedIds?: string[]
  listIds?: string[]
  inboxIds?: string[]
}

type SubscriptionDeleteResult = {
  feedId: string | null
  listId: string | null
  inboxId: string | null
  type: "feed" | "list" | "inbox"
}

export const collectCleanupTargets = (results: SubscriptionDeleteResult[]) => {
  const feedIds = new Set<string>()
  const listIds = new Set<string>()
  const inboxIds = new Set<string>()

  for (const result of results) {
    if (result.type === "feed" && result.feedId) {
      feedIds.add(result.feedId)
    }
    if (result.type === "list" && result.listId) {
      listIds.add(result.listId)
    }
    if (result.type === "inbox" && result.inboxId) {
      inboxIds.add(result.inboxId)
    }
  }

  return {
    feedIds: Array.from(feedIds),
    listIds: Array.from(listIds),
    inboxIds: Array.from(inboxIds),
  }
}

class SubscriptionServiceStatic implements Resetable {
  getSubscriptionAll() {
    return db.query.subscriptionsTable.findMany()
  }

  async reset() {
    await db.delete(subscriptionsTable).execute()
  }
  async upsertMany(subscriptions: SubscriptionSchema[]) {
    if (subscriptions.length === 0) return
    await db
      .insert(subscriptionsTable)
      .values(subscriptions)
      .onConflictDoUpdate({
        target: [subscriptionsTable.id],
        set: {
          category: sql`excluded.category`,
          createdAt: sql`excluded.created_at`,
          feedId: sql`excluded.feed_id`,
          isPrivate: sql`excluded.is_private`,
          title: sql`excluded.title`,
          userId: sql`excluded.user_id`,
          view: sql`excluded.view`,
        },
      })
  }

  async patch(subscription: Partial<SubscriptionSchema> & { id: string }) {
    await db
      .update(subscriptionsTable)
      .set(subscription)
      .where(eq(subscriptionsTable.id, subscription.id))
  }

  async patchMany({ feedIds, data }: { feedIds: string[]; data: Partial<SubscriptionSchema> }) {
    await db.update(subscriptionsTable).set(data).where(inArray(subscriptionsTable.feedId, feedIds))
  }

  async deleteNotExists(existsIds: string[], view?: FeedViewType) {
    const notExistsIds = await db.query.subscriptionsTable.findMany({
      where: and(
        notInArray(subscriptionsTable.id, existsIds),
        typeof view === "number" ? eq(subscriptionsTable.view, view) : undefined,
      ),
      columns: {
        id: true,
      },
    })
    if (notExistsIds.length === 0) return

    this.delete(notExistsIds.map((s) => s.id))
  }

  async delete(id: string | string[]) {
    const ids = Array.isArray(id) ? id : [id]
    await this.deleteByTargets({ ids })
  }

  async deleteByTargets({ ids = [], feedIds = [], listIds = [], inboxIds = [] }: DeleteTargets) {
    const conditions = [
      ids.length > 0 ? inArray(subscriptionsTable.id, ids) : undefined,
      feedIds.length > 0 ? inArray(subscriptionsTable.feedId, feedIds) : undefined,
      listIds.length > 0 ? inArray(subscriptionsTable.listId, listIds) : undefined,
      inboxIds.length > 0 ? inArray(subscriptionsTable.inboxId, inboxIds) : undefined,
    ].filter(Boolean)

    if (conditions.length === 0) return

    const whereClause = conditions.length === 1 ? conditions[0]! : or(...conditions)

    const results = await db.query.subscriptionsTable.findMany({
      where: whereClause,
      columns: {
        feedId: true,
        listId: true,
        type: true,
        inboxId: true,
      },
    })

    await db.delete(subscriptionsTable).where(whereClause).execute()

    if (!results || results.length === 0) return

    const cleanup = collectCleanupTargets(results as SubscriptionDeleteResult[])

    if (cleanup.feedIds.length > 0) {
      const entries = await db.query.entriesTable.findMany({
        where: inArray(entriesTable.feedId, cleanup.feedIds),
        columns: { id: true },
      })
      const entryIds = entries.map((entry) => entry.id)

      await db.delete(entriesTable).where(inArray(entriesTable.feedId, cleanup.feedIds)).execute()

      if (entryIds.length > 0) {
        await db.delete(collectionsTable).where(inArray(collectionsTable.entryId, entryIds)).execute()
        await db.delete(summariesTable).where(inArray(summariesTable.entryId, entryIds)).execute()
        await db.delete(translationsTable).where(inArray(translationsTable.entryId, entryIds)).execute()
      }

      await UnreadService.deleteByIds(cleanup.feedIds)

      for (const feedId of cleanup.feedIds) {
        await db.delete(feedsTable).where(eq(feedsTable.id, feedId)).execute()
      }
    }

    if (cleanup.listIds.length > 0) {
      await UnreadService.deleteByIds(cleanup.listIds)
      for (const listId of cleanup.listIds) {
        await db.delete(listsTable).where(eq(listsTable.id, listId)).execute()
      }
    }

    if (cleanup.inboxIds.length > 0) {
      const inboxEntries = await db.query.entriesTable.findMany({
        where: inArray(entriesTable.inboxHandle, cleanup.inboxIds),
        columns: { id: true },
      })
      const inboxEntryIds = inboxEntries.map((entry) => entry.id)

      await db
        .delete(entriesTable)
        .where(inArray(entriesTable.inboxHandle, cleanup.inboxIds))
        .execute()

      if (inboxEntryIds.length > 0) {
        await db
          .delete(collectionsTable)
          .where(inArray(collectionsTable.entryId, inboxEntryIds))
          .execute()
        await db.delete(summariesTable).where(inArray(summariesTable.entryId, inboxEntryIds)).execute()
        await db
          .delete(translationsTable)
          .where(inArray(translationsTable.entryId, inboxEntryIds))
          .execute()
      }

      await UnreadService.deleteByIds(cleanup.inboxIds)
      for (const inboxId of cleanup.inboxIds) {
        await db.delete(inboxesTable).where(eq(inboxesTable.id, inboxId)).execute()
      }
    }
  }
}
export const SubscriptionService = new SubscriptionServiceStatic()
