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
    const entrySourceKind = sql<string>`CASE
      WHEN ${entriesTable.inboxHandle} IS NOT NULL THEN 'inbox'
      ELSE 'feed'
    END`
    const activeSubscriptionKind = sql<string>`CASE ${subscriptionsTable.type}
      WHEN 'feed' THEN 'feed'
      WHEN 'inbox' THEN 'inbox'
    END`
    const activeSubscriptionSourceId = sql<string>`CASE ${subscriptionsTable.type}
      WHEN 'feed' THEN ${subscriptionsTable.feedId}
      WHEN 'inbox' THEN ${subscriptionsTable.inboxId}
    END`
    const activeSources = db
      .selectDistinct({
        kind: activeSubscriptionKind.as("kind"),
        sourceId: activeSubscriptionSourceId.as("source_id"),
      })
      .from(subscriptionsTable)
      .where(
        and(
          isNull(subscriptionsTable.deletedAt),
          sql`${activeSubscriptionKind} IS NOT NULL`,
          sql`${activeSubscriptionSourceId} IS NOT NULL`,
        ),
      )
      .as("active_sources")

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
        .innerJoin(
          activeSources,
          and(eq(activeSources.kind, entrySourceKind), eq(activeSources.sourceId, entrySourceId)),
        )
        .where(
          and(
            sql`${entriesTable.read} IS NOT TRUE`,
            isNull(entriesTable.deletedAt),
            sql`${entrySourceId} IS NOT NULL`,
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
