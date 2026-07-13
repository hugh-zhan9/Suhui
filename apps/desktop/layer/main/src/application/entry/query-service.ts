import type { AnyColumn, SQL } from "drizzle-orm"
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { collectionsTable } from "@suhui/database/schemas/index"
import {
  getActiveVisibilityState,
  type ActiveVisibilityState,
} from "@suhui/database/services/internal/active-visibility"
import { SubscriptionService } from "@suhui/database/services/subscription"

import { DBManager } from "~/manager/db"

import { createEntryCursorWhere, decodeEntryCursor, encodeEntryCursor } from "./query-cursor"
import {
  type DetailVisibilityPolicy,
  type EntryDetail,
  type EntryListQuery,
  type EntryListScope,
  EntryQueryError,
  type EntrySummary,
  type EntrySummaryPage,
  normalizeEntryListLimit,
} from "./query-types"

type VisibilityColumns = {
  feedId: AnyColumn
  inboxHandle: AnyColumn
  sources: AnyColumn
}

type SubscriptionRow = {
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

const createVisibilityWhere = (
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

const normalizeNonEmptyId = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", `${label} must be a non-empty string`)
  }
  return value.trim()
}

const normalizeScope = (scope: EntryListScope): EntryListScope => {
  if (!scope || typeof scope !== "object" || typeof scope.kind !== "string") {
    throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", "scope is invalid")
  }
  switch (scope.kind) {
    case "timeline": {
      if (
        scope.view !== undefined &&
        (typeof scope.view !== "number" ||
          !Number.isFinite(scope.view) ||
          !Number.isInteger(scope.view))
      ) {
        throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", "timeline view must be an integer")
      }
      if (scope.excludePrivate !== undefined && typeof scope.excludePrivate !== "boolean") {
        throw new EntryQueryError(
          "SUHUI_INVALID_ENTRY_SCOPE",
          "timeline excludePrivate must be true or false",
        )
      }
      return scope
    }
    case "feeds": {
      if (!Array.isArray(scope.feedIds) || scope.feedIds.some((id) => typeof id !== "string")) {
        throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", "feedIds must be a string array")
      }
      return {
        kind: "feeds",
        feedIds: Array.from(new Set(scope.feedIds.map((id) => id.trim()).filter(Boolean))),
      }
    }
    case "list":
      return { kind: "list", listId: normalizeNonEmptyId(scope.listId, "listId") }
    case "inbox":
      return { kind: "inbox", inboxId: normalizeNonEmptyId(scope.inboxId, "inboxId") }
    case "collection":
      if (
        scope.view !== undefined &&
        (typeof scope.view !== "number" ||
          !Number.isFinite(scope.view) ||
          !Number.isInteger(scope.view))
      ) {
        throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", "collection view must be an integer")
      }
      return scope
    default:
      throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", "scope kind is invalid")
  }
}

const subscriptionSourceId = (subscription: SubscriptionRow): string | null => {
  if (subscription.type === "feed") return subscription.feedId ?? null
  if (subscription.type === "list") return subscription.listId ?? null
  if (subscription.type === "inbox") return subscription.inboxId ?? null
  return null
}

const createTimelineWhere = (
  entries: VisibilityColumns,
  scope: Extract<EntryListScope, { kind: "timeline" }>,
  subscriptions: SubscriptionRow[],
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
  subscriptions: SubscriptionRow[],
): SQL => {
  switch (scope.kind) {
    case "timeline":
      return createTimelineWhere(entries, scope, subscriptions)
    case "feeds":
      return inArray(entries.feedId, scope.feedIds)
    case "list":
      return sourcePredicate(entries.sources, [scope.listId])
    case "inbox":
      return eq(entries.inboxHandle, scope.inboxId)
    case "collection":
      return sql`exists (select 1 from ${collectionsTable} where ${collectionsTable.entryId} = ${entries.id} and ${collectionsTable.deletedAt} is null${
        typeof scope.view === "number" ? sql` and ${collectionsTable.view} = ${scope.view}` : sql``
      })`
  }
}

const mapSummary = (row: Omit<EntrySummary, "recordKind" | "read"> & { read?: boolean | null }) =>
  ({ ...row, read: row.read === true, recordKind: "summary" }) as EntrySummary

export class EntryQueryService {
  async list(query: EntryListQuery): Promise<EntrySummaryPage> {
    const limit = normalizeEntryListLimit(query.limit)
    if (query.read !== undefined && typeof query.read !== "boolean") {
      throw new EntryQueryError("SUHUI_INVALID_READ_FILTER", "read must be true or false")
    }
    const scope = normalizeScope(query.scope)
    if (scope.kind === "feeds" && scope.feedIds.length === 0) {
      return { items: [], page: { limit, hasMore: false, nextCursor: null } }
    }

    const cursor = query.cursor ? decodeEntryCursor(query.cursor) : null
    const [visibility, subscriptions] = await Promise.all([
      getActiveVisibilityState(),
      SubscriptionService.getSubscriptionAll() as Promise<SubscriptionRow[]>,
    ])
    const db = DBManager.getDB()
    const rows = (await db.query.entriesTable.findMany({
      where: (entries) =>
        and(
          isNull(entries.deletedAt),
          createVisibilityWhere(entries, visibility),
          createScopeWhere(entries, scope, subscriptions),
          query.read === false
            ? sql`${entries.read} IS NOT TRUE`
            : query.read === true
              ? eq(entries.read, true)
              : undefined,
          createEntryCursorWhere(entries, cursor),
        ),
      orderBy: (entries, { desc }) => [
        desc(entries.publishedAt),
        desc(entries.insertedAt),
        desc(entries.id),
      ],
      columns: entrySummaryColumns,
      limit: limit + 1,
    })) as Array<Omit<EntrySummary, "recordKind" | "read"> & { read?: boolean | null }>

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map(mapSummary)
    const last = hasMore ? items.at(-1) : null
    return {
      items,
      page: {
        limit,
        hasMore,
        nextCursor: last
          ? encodeEntryCursor({
              v: 1,
              publishedAt: last.publishedAt,
              insertedAt: last.insertedAt,
              id: last.id,
            })
          : null,
      },
    }
  }

  async getDetail(entryId: string, policy: DetailVisibilityPolicy): Promise<EntryDetail | null> {
    const id = normalizeNonEmptyId(entryId, "entryId")
    const visibility = policy === "active-relations" ? await getActiveVisibilityState() : undefined
    const db = DBManager.getDB()
    const entry =
      ((await db.query.entriesTable.findFirst({
        where: (entries) =>
          and(
            eq(entries.id, id),
            isNull(entries.deletedAt),
            visibility ? createVisibilityWhere(entries, visibility) : undefined,
          ),
      })) as EntryDetail | undefined) ?? null
    return entry ? { ...entry, recordKind: "detail" } : null
  }
}

export const entryQueryService = new EntryQueryService()
