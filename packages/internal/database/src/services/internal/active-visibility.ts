import { isNull } from "drizzle-orm"

import { db } from "../../db"
import { subscriptionsTable } from "../../schemas"

type EntryLike = {
  feedId?: string | null
  inboxHandle?: string | null
  sources?: string[] | null
}

export type ActiveVisibilityState = {
  activeFeedIds: Set<string>
  activeListIds: Set<string>
  activeInboxIds: Set<string>
  sourceIdBySubscriptionId: Map<string, string>
}

export async function getActiveVisibilityState(): Promise<ActiveVisibilityState> {
  const subscriptions = await db.query.subscriptionsTable.findMany({
    where: isNull(subscriptionsTable.deletedAt),
    columns: {
      id: true,
      type: true,
      feedId: true,
      listId: true,
      inboxId: true,
    },
  })

  const activeFeedIds = new Set<string>()
  const activeListIds = new Set<string>()
  const activeInboxIds = new Set<string>()
  const sourceIdBySubscriptionId = new Map<string, string>()

  for (const subscription of subscriptions) {
    const sourceId =
      subscription.type === "feed"
        ? subscription.feedId
        : subscription.type === "list"
          ? subscription.listId
          : subscription.inboxId

    if (!sourceId) continue
    sourceIdBySubscriptionId.set(subscription.id, sourceId)

    if (subscription.type === "feed" && subscription.feedId) {
      activeFeedIds.add(subscription.feedId)
    } else if (subscription.type === "list" && subscription.listId) {
      activeListIds.add(subscription.listId)
    } else if (subscription.type === "inbox" && subscription.inboxId) {
      activeInboxIds.add(subscription.inboxId)
    }
  }

  return {
    activeFeedIds,
    activeListIds,
    activeInboxIds,
    sourceIdBySubscriptionId,
  }
}

export function isEntryVisibleForActiveRelations(
  entry: EntryLike | null | undefined,
  state: ActiveVisibilityState,
) {
  if (!entry) return false

  if (entry.inboxHandle && state.activeInboxIds.has(entry.inboxHandle)) {
    return true
  }

  if (entry.feedId && state.activeFeedIds.has(entry.feedId)) {
    return true
  }

  for (const source of entry.sources ?? []) {
    if (!source || source === "feed") continue
    if (
      state.activeListIds.has(source) ||
      state.activeInboxIds.has(source) ||
      state.activeFeedIds.has(source)
    ) {
      return true
    }
  }

  return false
}
