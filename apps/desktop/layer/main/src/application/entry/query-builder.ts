import { collectionsTable } from "@suhui/database/schemas/index"
import type { ActiveVisibilityState } from "@suhui/database/services/internal/active-visibility"
import type { AnyColumn, SQL } from "drizzle-orm"
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm"

import type { EntryCursor } from "./query-cursor"
import { createEntryCursorWhere } from "./query-cursor"
import type { EntryListScope } from "./query-types"

type VisibilityColumns = {
  feedId: AnyColumn
  inboxHandle: AnyColumn
  sources: AnyColumn
}

export type EntryQuerySubscription = {
  type?: "feed" | "list" | "inbox"
  feedId?: string | null
  listId?: string | null
  inboxId?: string | null
  view?: number | null
  isPrivate?: boolean | null
  hideFromTimeline?: boolean | null
}

export const entrySummaryColumns = {
  id: true,
  title: true,
  url: true,
  description: true,
  guid: true,
  author: true,
  authorUrl: true,
  authorAvatar: true,
  insertedAt: true,
  publishedAt: true,
  media: true,
  categories: true,
  attachments: true,
  language: true,
  feedId: true,
  inboxHandle: true,
  read: true,
  sources: true,
  content: false,
  readabilityContent: false,
  readabilityUpdatedAt: false,
  extra: false,
  settings: false,
  deletedAt: false,
} as const

const sourcePredicate = (sources: AnyColumn, ids: string[]): SQL => {
  if (ids.length === 0) return sql`false`
  return sql`${sources} ?| array[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]`
}

export const createEntryVisibilityWhere = (
  entries: VisibilityColumns,
  visibility: ActiveVisibilityState,
): SQL => {
  const conditions: SQL[] = []
  const feedIds = Array.from(visibility.activeFeedIds)
  const inboxIds = Array.from(visibility.activeInboxIds)
  const sourceIds = Array.from(
    new Set([...feedIds, ...visibility.activeListIds, ...visibility.activeInboxIds]),
  )

  if (feedIds.length > 0) conditions.push(inArray(entries.feedId, feedIds))
  if (inboxIds.length > 0) conditions.push(inArray(entries.inboxHandle, inboxIds))
  if (sourceIds.length > 0) conditions.push(sourcePredicate(entries.sources, sourceIds))
  if (conditions.length === 0) return sql`false`
  return conditions.length === 1 ? conditions[0]! : or(...conditions)!
}

const subscriptionSourceId = (subscription: EntryQuerySubscription): string | null => {
  if (subscription.type === "feed") return subscription.feedId ?? null
  if (subscription.type === "list") return subscription.listId ?? null
  if (subscription.type === "inbox") return subscription.inboxId ?? null
  return null
}

const createTimelineWhere = (
  entries: VisibilityColumns,
  scope: Extract<EntryListScope, { kind: "timeline" }>,
  subscriptions: EntryQuerySubscription[],
): SQL => {
  const eligible = subscriptions.filter(
    (subscription) =>
      subscription.hideFromTimeline !== true &&
      (!scope.excludePrivate || subscription.isPrivate !== true) &&
      (typeof scope.view !== "number" || subscription.view === scope.view),
  )
  const feedIds = eligible.flatMap((subscription) =>
    subscription.type === "feed" && subscription.feedId ? [subscription.feedId] : [],
  )
  const inboxIds = eligible.flatMap((subscription) =>
    subscription.type === "inbox" && subscription.inboxId ? [subscription.inboxId] : [],
  )
  const sourceIds = eligible.flatMap((subscription) => {
    const sourceId = subscriptionSourceId(subscription)
    return sourceId ? [sourceId] : []
  })
  const conditions: SQL[] = []
  if (feedIds.length > 0) conditions.push(inArray(entries.feedId, feedIds))
  if (inboxIds.length > 0) conditions.push(inArray(entries.inboxHandle, inboxIds))
  if (sourceIds.length > 0) conditions.push(sourcePredicate(entries.sources, sourceIds))
  if (conditions.length === 0) return sql`false`
  return conditions.length === 1 ? conditions[0]! : or(...conditions)!
}

const createScopeWhere = (
  entries: VisibilityColumns & { id: AnyColumn },
  scope: EntryListScope,
  subscriptions: EntryQuerySubscription[],
): SQL => {
  switch (scope.kind) {
    case "timeline": {
      return createTimelineWhere(entries, scope, subscriptions)
    }
    case "feeds": {
      return inArray(entries.feedId, scope.feedIds)
    }
    case "list": {
      return sourcePredicate(entries.sources, [scope.listId])
    }
    case "inbox": {
      return eq(entries.inboxHandle, scope.inboxId)
    }
    case "collection": {
      return sql`exists (select 1 from ${collectionsTable} where ${collectionsTable.entryId} = ${entries.id} and ${collectionsTable.deletedAt} is null${
        typeof scope.view === "number" ? sql` and ${collectionsTable.view} = ${scope.view}` : sql``
      })`
    }
  }
}

export const buildEntryListQueryConfig = (input: {
  scope: EntryListScope
  read?: boolean
  cursor: EntryCursor | null
  visibility: ActiveVisibilityState
  subscriptions: EntryQuerySubscription[]
  limit: number
}) => ({
  where: (entries: {
    id: AnyColumn
    feedId: AnyColumn
    inboxHandle: AnyColumn
    sources: AnyColumn
    deletedAt: AnyColumn
    read: AnyColumn
    publishedAt: AnyColumn
    insertedAt: AnyColumn
  }) =>
    and(
      isNull(entries.deletedAt),
      createEntryVisibilityWhere(entries, input.visibility),
      createScopeWhere(entries, input.scope, input.subscriptions),
      input.read === false
        ? sql`${entries.read} IS NOT TRUE`
        : input.read === true
          ? eq(entries.read, true)
          : undefined,
      createEntryCursorWhere(entries, input.cursor),
    ),
  orderBy: (
    entries: { publishedAt: AnyColumn; insertedAt: AnyColumn; id: AnyColumn },
    { desc }: { desc: (column: AnyColumn) => SQL },
  ) => [desc(entries.publishedAt), desc(entries.insertedAt), desc(entries.id)],
  columns: entrySummaryColumns,
  limit: input.limit + 1,
})
