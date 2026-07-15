import { entriesTable, subscriptionsTable, unreadTable } from "@suhui/database/schemas/index"
import { and, count, eq, isNull, sql } from "drizzle-orm"

import { DBManager } from "~/manager/db"

export class UnreadApplicationService {
  async listUnreadCounts() {
    const db = DBManager.getDB()
    const subscriptionSourceId = sql<string>`CASE ${subscriptionsTable.type}
      WHEN 'feed' THEN ${subscriptionsTable.feedId}
      WHEN 'list' THEN ${subscriptionsTable.listId}
      ELSE ${subscriptionsTable.inboxId}
    END`
    const entrySourceId = sql<string>`COALESCE(
      ${entriesTable.inboxHandle},
      ${entriesTable.feedId}
    )`
    const hasActiveSubscription = sql`EXISTS (
      SELECT 1
      FROM ${subscriptionsTable}
      WHERE ${subscriptionsTable.deletedAt} IS NULL
        AND (
          (
            ${entriesTable.inboxHandle} IS NOT NULL
            AND ${subscriptionsTable.type} = ${"inbox"}
            AND ${subscriptionsTable.inboxId} = ${entriesTable.inboxHandle}
          )
          OR (
            ${entriesTable.inboxHandle} IS NULL
            AND ${subscriptionsTable.type} = ${"feed"}
            AND ${subscriptionsTable.feedId} = ${entriesTable.feedId}
          )
        )
    )`

    const [unreads, unreadEntries] = await Promise.all([
      db
        .select({
          id: subscriptionSourceId,
          count: sql<number>`SUM(${unreadTable.count})`.mapWith(Number),
        })
        .from(unreadTable)
        .innerJoin(
          subscriptionsTable,
          and(eq(unreadTable.id, subscriptionsTable.id), isNull(subscriptionsTable.deletedAt)),
        )
        .where(sql`${subscriptionSourceId} IS NOT NULL`)
        .groupBy(subscriptionSourceId),
      db
        .select({
          id: entrySourceId,
          count: count(entriesTable.id),
        })
        .from(entriesTable)
        .where(
          and(
            sql`${entriesTable.read} IS NOT TRUE`,
            isNull(entriesTable.deletedAt),
            sql`${entrySourceId} IS NOT NULL`,
            hasActiveSubscription,
          ),
        )
        .groupBy(entrySourceId),
    ])

    const mergedCountById = new Map<string, number>()
    for (const unread of unreads) {
      if (!unread.id) continue
      mergedCountById.set(unread.id, unread.count)
    }

    for (const entry of unreadEntries) {
      if (!entry.id) continue
      // Derived entry counts remain the source of truth when both stores contain a source.
      mergedCountById.set(entry.id, entry.count)
    }

    return Array.from(mergedCountById.entries()).map(([id, count]) => ({ id, count }))
  }
}

export const unreadApplicationService = new UnreadApplicationService()
