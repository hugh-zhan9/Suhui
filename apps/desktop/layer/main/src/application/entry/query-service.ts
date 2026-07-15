import { getActiveVisibilityState } from "@suhui/database/services/internal/active-visibility"
import { SubscriptionService } from "@suhui/database/services/subscription"
import { and, eq, isNull } from "drizzle-orm"

import { DBManager } from "~/manager/db"

import type { EntryQuerySubscription } from "./query-builder"
import { buildEntryListQueryConfig, createEntryVisibilityWhere } from "./query-builder"
import { decodeEntryCursor, encodeEntryCursor } from "./query-cursor"
import type {
  DetailVisibilityPolicy,
  EntryDetail,
  EntryListQuery,
  EntryListScope,
  EntrySummary,
  EntrySummaryPage,
} from "./query-types"
import { EntryQueryError, normalizeEntryListLimit } from "./query-types"

export { entrySummaryColumns } from "./query-builder"

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
    case "list": {
      return { kind: "list", listId: normalizeNonEmptyId(scope.listId, "listId") }
    }
    case "inbox": {
      return { kind: "inbox", inboxId: normalizeNonEmptyId(scope.inboxId, "inboxId") }
    }
    case "collection": {
      if (
        scope.view !== undefined &&
        (typeof scope.view !== "number" ||
          !Number.isFinite(scope.view) ||
          !Number.isInteger(scope.view))
      ) {
        throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", "collection view must be an integer")
      }
      return scope
    }
    default: {
      throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", "scope kind is invalid")
    }
  }
}

const mapSummary = (row: Omit<EntrySummary, "recordKind" | "read"> & { read?: boolean | null }) =>
  ({ ...row, read: row.read === true, recordKind: "summary" }) as EntrySummary

export class EntryQueryService {
  async list(query: EntryListQuery): Promise<EntrySummaryPage> {
    const queryStartedAt = performance.now()
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
      SubscriptionService.getSubscriptionAll() as Promise<EntryQuerySubscription[]>,
    ])
    const db = DBManager.getDB()
    const rows = (await db.query.entriesTable.findMany(
      buildEntryListQueryConfig({
        scope,
        read: query.read,
        cursor,
        visibility,
        subscriptions,
        limit,
      }),
    )) as Array<Omit<EntrySummary, "recordKind" | "read"> & { read?: boolean | null }>

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map(mapSummary)
    const last = hasMore ? items.at(-1) : null
    const result = {
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
    console.info(
      "[PerformanceMetric]",
      JSON.stringify({
        metric: "entry_query_duration_ms",
        value: Math.max(0, Math.round((performance.now() - queryStartedAt) * 100) / 100),
      }),
    )
    console.info(
      "[PerformanceMetric]",
      JSON.stringify({ metric: "entry_query_rows", value: items.length }),
    )
    return result
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
            visibility ? createEntryVisibilityWhere(entries, visibility) : undefined,
          ),
      })) as EntryDetail | undefined) ?? null
    return entry ? { ...entry, recordKind: "detail" } : null
  }
}

export const entryQueryService = new EntryQueryService()
