import { getActiveVisibilityState } from "@suhui/database/services/internal/active-visibility"
import { SubscriptionService } from "@suhui/database/services/subscription"
import { and, eq, inArray, isNull } from "drizzle-orm"
import type { ContentClusterSchema } from "@suhui/database/schemas/types"

import { DBManager } from "~/manager/db"

import type { EntryQuerySubscription } from "./query-builder"
import {
  buildEntryListQueryConfig,
  createEntryVisibilityWhere,
  entrySummaryColumns,
} from "./query-builder"
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
import { chooseClusterRepresentative } from "../dedup/fingerprint"

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
    if (query.includeHidden !== undefined && typeof query.includeHidden !== "boolean") {
      throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", "includeHidden must be true or false")
    }
    if (query.deduplicate !== undefined && typeof query.deduplicate !== "boolean") {
      throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", "deduplicate must be true or false")
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
    const pageItems: EntrySummary[] = []
    let scanCursor = cursor
    let lastScanned: EntrySummary | null = null
    let hasMore = false
    // Folding can discard every raw row in a cursor window when the stable
    // representative occurs later. Continue scanning internally so callers
    // receive a dense page (or the actual end), never an empty intermediary.
    scan: while (pageItems.length < limit) {
      const rows = (await db.query.entriesTable.findMany(
        buildEntryListQueryConfig({
          scope,
          read: query.read,
          cursor: scanCursor,
          visibility,
          subscriptions,
          limit,
          includeHidden: query.includeHidden,
        }),
      )) as Array<Omit<EntrySummary, "recordKind" | "read"> & { read?: boolean | null }>
      const rawItems = rows.slice(0, limit).map(mapSummary)
      const enriched = await this.enrichAndFold(rawItems, query.deduplicate !== false, {
        scope,
        read: query.read,
        visibility,
        subscriptions,
        includeHidden: query.includeHidden,
      })
      const enrichedById = new Map(enriched.map((item) => [item.id, item]))
      for (const rawItem of rawItems) {
        lastScanned = rawItem
        const item = enrichedById.get(rawItem.id)
        if (item) pageItems.push(item)
        if (pageItems.length === limit) {
          hasMore = rows.length > limit || rawItems.at(-1)?.id !== rawItem.id
          break scan
        }
      }
      if (rows.length <= limit || !lastScanned) {
        hasMore = false
        break
      }
      scanCursor = {
        v: 1,
        publishedAt: lastScanned.publishedAt,
        insertedAt: lastScanned.insertedAt,
        id: lastScanned.id,
      }
      hasMore = true
    }
    const last = hasMore ? lastScanned : null
    const result = {
      items: pageItems,
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
      JSON.stringify({ metric: "entry_query_rows", value: pageItems.length }),
    )
    return result
  }

  private async enrichAndFold(
    items: EntrySummary[],
    deduplicate: boolean,
    eligibility: {
      scope: EntryListScope
      read?: boolean
      visibility: Awaited<ReturnType<typeof getActiveVisibilityState>>
      subscriptions: EntryQuerySubscription[]
      includeHidden?: boolean
    },
  ) {
    if (items.length === 0) return items
    const db = DBManager.getDB()
    const entryIds = items.map((item) => item.id)
    const memberships = await db.query.contentClusterMembersTable.findMany({
      where: (member, { inArray }) => inArray(member.entryId, entryIds),
    })
    if (!deduplicate) {
      const [states, tags] = await Promise.all([
        db.query.entryUserStateTable.findMany({
          where: (state, { inArray }) => inArray(state.entryId, entryIds),
        }),
        db.query.entryTagsTable.findMany({
          where: (tag, { inArray }) => inArray(tag.entryId, entryIds),
        }),
      ])
      const stateByEntry = new Map(states.map((state) => [state.entryId, state]))
      const tagsByEntry = new Map<string, string[]>()
      for (const tag of tags) {
        const values = tagsByEntry.get(tag.entryId) ?? []
        values.push(tag.tag)
        tagsByEntry.set(tag.entryId, values)
      }
      return items.map((item) => ({
        ...item,
        hidden: stateByEntry.get(item.id)?.hidden ?? false,
        tags: tagsByEntry.get(item.id) ?? [],
      }))
    }

    const clusterIds = Array.from(new Set(memberships.map((member) => member.clusterId)))
    const allMembers = clusterIds.length
      ? await db.query.contentClusterMembersTable.findMany({
          where: (member, { inArray }) => inArray(member.clusterId, clusterIds),
        })
      : []
    const allMemberIds = Array.from(
      new Set([...entryIds, ...allMembers.map((member) => member.entryId)]),
    )
    const [states, tags] = await Promise.all([
      db.query.entryUserStateTable.findMany({
        where: (state, { inArray }) => inArray(state.entryId, allMemberIds),
      }),
      db.query.entryTagsTable.findMany({
        where: (tag, { inArray }) => inArray(tag.entryId, allMemberIds),
      }),
    ])
    const stateByEntry = new Map(states.map((state) => [state.entryId, state]))
    const tagsByEntry = new Map<string, string[]>()
    for (const tag of tags) {
      const values = tagsByEntry.get(tag.entryId) ?? []
      values.push(tag.tag)
      tagsByEntry.set(tag.entryId, values)
    }
    const membershipByEntry = new Map(memberships.map((member) => [member.entryId, member]))
    const membersByCluster = new Map<string, string[]>()
    for (const member of allMembers) {
      const values = membersByCluster.get(member.clusterId) ?? []
      values.push(member.entryId)
      membersByCluster.set(member.clusterId, values)
    }
    const duplicateClusterIds = clusterIds.filter(
      (clusterId) => (membersByCluster.get(clusterId)?.length ?? 0) > 1,
    )
    const clusters = duplicateClusterIds.length
      ? await db.query.contentClustersTable.findMany({
          where: (cluster, { inArray }) => inArray(cluster.id, duplicateClusterIds),
        })
      : []
    const clusterById = new Map<string, ContentClusterSchema>(
      (clusters as ContentClusterSchema[]).map((cluster) => [cluster.id, cluster]),
    )
    const candidateEntryIds = Array.from(
      new Set(duplicateClusterIds.flatMap((clusterId) => membersByCluster.get(clusterId) ?? [])),
    )
    const [candidateRows, collections, queueItems, notes, highlights] = candidateEntryIds.length
      ? await Promise.all([
          db.query.entriesTable.findMany({
            ...buildEntryListQueryConfig({
              ...eligibility,
              cursor: null,
              limit: candidateEntryIds.length,
              candidateIds: candidateEntryIds,
            }),
            columns: {
              ...entrySummaryColumns,
              content: true,
              readabilityContent: true,
            },
          }),
          db.query.collectionsTable.findMany({
            where: (collection, { inArray, isNull, and }) =>
              and(inArray(collection.entryId, candidateEntryIds), isNull(collection.deletedAt)),
          }),
          db.query.readingQueueTable.findMany({
            where: (queue, { inArray }) => inArray(queue.entryId, candidateEntryIds),
          }),
          db.query.entryNotesTable.findMany({
            where: (note, { inArray, isNull, and }) =>
              and(inArray(note.entryId, candidateEntryIds), isNull(note.deletedAt)),
          }),
          db.query.entryHighlightsTable.findMany({
            where: (highlight, { inArray, isNull, and }) =>
              and(inArray(highlight.entryId, candidateEntryIds), isNull(highlight.deletedAt)),
          }),
        ])
      : [[], [], [], [], []]
    const investedIds = new Set([
      ...collections.map((item) => item.entryId),
      ...queueItems.map((item) => item.entryId),
      ...notes.map((item) => item.entryId),
      ...highlights.map((item) => item.entryId),
    ])
    const candidateById = new Map(candidateRows.map((row) => [row.id, row]))
    const emittedClusters = new Set<string>()
    const result: EntrySummary[] = []
    for (const item of items) {
      const membership = membershipByEntry.get(item.id)
      if (!membership) {
        result.push({
          ...item,
          hidden: stateByEntry.get(item.id)?.hidden ?? false,
          tags: tagsByEntry.get(item.id) ?? [],
        })
        continue
      }
      if (emittedClusters.has(membership.clusterId)) continue
      const memberIds = membersByCluster.get(membership.clusterId) ?? [item.id]
      if (memberIds.length < 2) {
        emittedClusters.add(membership.clusterId)
        result.push({
          ...item,
          hidden: stateByEntry.get(item.id)?.hidden ?? false,
          tags: tagsByEntry.get(item.id) ?? [],
        })
        continue
      }
      const manualId = clusterById.get(membership.clusterId)?.manualRepresentativeEntryId
      const representativeId = chooseClusterRepresentative(
        memberIds.flatMap((id) => {
          const candidate = candidateById.get(id)
          if (!candidate) return []
          return [
            {
              id,
              publishedAt: candidate.publishedAt,
              contentLength: (
                candidate.content ??
                candidate.readabilityContent ??
                candidate.description ??
                ""
              ).length,
              hasUserInvestment: investedIds.has(id),
            },
          ]
        }),
        manualId,
      )
      // Emit the cluster exactly where its stable, eligible representative
      // occurs in the ordered raw query. This preserves filters and prevents a
      // cluster from reappearing when its members straddle cursor pages.
      if (representativeId !== item.id) continue
      emittedClusters.add(membership.clusterId)
      const visibleRepresentative = item
      result.push({
        ...visibleRepresentative,
        hidden: stateByEntry.get(visibleRepresentative.id)?.hidden ?? false,
        tags: tagsByEntry.get(visibleRepresentative.id) ?? [],
        cluster: {
          id: membership.clusterId,
          representativeEntryId: visibleRepresentative.id,
          sourceCount: memberIds.length,
          entryIds: memberIds,
        },
      })
    }
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
