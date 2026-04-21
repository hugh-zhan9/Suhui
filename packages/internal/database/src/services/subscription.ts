import type { FeedViewType } from "@suhui/constants"
import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm"

import { db } from "../db"
import { subscriptionsTable } from "../schemas"
import type { SubscriptionSchema } from "../schemas/types"
import type { Resetable } from "./internal/base"
import { recordSyncOp } from "./internal/sync-proxy"

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
    return db.query.subscriptionsTable.findMany({
      where: isNull(subscriptionsTable.deletedAt),
    })
  }

  async purgeAllForMaintenance() {
    await db.delete(subscriptionsTable).execute()
  }
  async reset() {
    await this.purgeAllForMaintenance()
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
          listId: sql`excluded.list_id`,
          inboxId: sql`excluded.inbox_id`,
          isPrivate: sql`excluded.is_private`,
          hideFromTimeline: sql`excluded.hide_from_timeline`,
          title: sql`excluded.title`,
          userId: sql`excluded.user_id`,
          view: sql`excluded.view`,
          deletedAt: sql`excluded.deleted_at`,
        },
      })
  }

  async patch(subscription: Partial<SubscriptionSchema> & { id: string }) {
    await db
      .update(subscriptionsTable)
      .set(subscription)
      .where(and(eq(subscriptionsTable.id, subscription.id), isNull(subscriptionsTable.deletedAt)))

    recordSyncOp("subscription.update", "subscription", subscription.id, subscription)
  }

  async patchMany({ feedIds, data }: { feedIds: string[]; data: Partial<SubscriptionSchema> }) {
    const subs = await db.query.subscriptionsTable.findMany({
      where: and(inArray(subscriptionsTable.feedId, feedIds), isNull(subscriptionsTable.deletedAt)),
      columns: { id: true },
    })

    await db
      .update(subscriptionsTable)
      .set(data)
      .where(and(inArray(subscriptionsTable.feedId, feedIds), isNull(subscriptionsTable.deletedAt)))

    for (const sub of subs) {
      recordSyncOp("subscription.update", "subscription", sub.id, data)
    }
  }

  async deleteNotExists(existsIds: string[], view?: FeedViewType) {
    const notExistsIds = await db.query.subscriptionsTable.findMany({
      where: and(
        notInArray(subscriptionsTable.id, existsIds),
        isNull(subscriptionsTable.deletedAt),
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

    await db
      .update(subscriptionsTable)
      .set({ deletedAt: Date.now() })
      .where(and(whereClause, isNull(subscriptionsTable.deletedAt)))
      .execute()
  }
}
export const SubscriptionService = new SubscriptionServiceStatic()
