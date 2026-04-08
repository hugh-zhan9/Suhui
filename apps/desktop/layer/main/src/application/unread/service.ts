import { DBManager } from "~/manager/db"

export class UnreadApplicationService {
  async listUnreadCounts() {
    const db = DBManager.getDB()
    const [unreads, subscriptions, unreadEntries] = await Promise.all([
      db.query.unreadTable.findMany(),
      db.query.subscriptionsTable.findMany({
        columns: {
          id: true,
          type: true,
          feedId: true,
          listId: true,
          inboxId: true,
        },
      }),
      db.query.entriesTable.findMany({
        where: (entries, { eq }) => eq(entries.read, false),
        columns: {
          feedId: true,
          inboxHandle: true,
        },
      }),
    ])

    const sourceIdBySubscriptionId = new Map<string, string>()
    for (const subscription of subscriptions) {
      const sourceId =
        subscription.type === "feed"
          ? subscription.feedId
          : subscription.type === "list"
            ? subscription.listId
            : subscription.inboxId

      if (sourceId) {
        sourceIdBySubscriptionId.set(subscription.id, sourceId)
      }
    }

    const mergedCountById = new Map<string, number>()
    for (const unread of unreads) {
      const normalizedId = sourceIdBySubscriptionId.get(unread.id) ?? unread.id
      mergedCountById.set(normalizedId, (mergedCountById.get(normalizedId) ?? 0) + unread.count)
    }

    const derivedCountById = new Map<string, number>()

    // Derive unread counts from entries as the source of truth for remote mode.
    for (const entry of unreadEntries) {
      const sourceId = entry.inboxHandle || entry.feedId
      if (!sourceId) continue
      derivedCountById.set(sourceId, (derivedCountById.get(sourceId) ?? 0) + 1)
    }

    for (const [id, count] of derivedCountById.entries()) {
      mergedCountById.set(id, count)
    }

    return Array.from(mergedCountById.entries()).map(([id, count]) => ({ id, count }))
  }
}

export const unreadApplicationService = new UnreadApplicationService()
