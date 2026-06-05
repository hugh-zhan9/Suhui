import type { AnyColumn } from "drizzle-orm"
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import {
  getActiveVisibilityState,
  type ActiveVisibilityState,
  isEntryVisibleForActiveRelations,
} from "@suhui/database/services/internal/active-visibility"
import { SubscriptionService } from "@suhui/database/services/subscription"

import { unreadApplicationService } from "~/application/unread/service"
import { DBManager } from "~/manager/db"
import { syncLogger } from "~/manager/sync-logger"

import { decodeAgentEntriesCursor, encodeAgentEntriesCursor } from "./cursor"
import {
  AgentApplicationError,
  type AgentEntriesListOptions,
  type AgentEntriesListResult,
  type AgentEntryDetail,
  type AgentEntryListItem,
  type AgentFeedsListResult,
  type AgentReadStatusResult,
  normalizeLimit,
  selectAgentEntryContent,
  toIsoString,
} from "./types"

type EntryRow = {
  id: string
  feedId?: string | null
  title?: string | null
  url?: string | null
  author?: string | null
  publishedAt: number
  insertedAt: number
  read?: boolean | null
  description?: string | null
  content?: string | null
  readabilityContent?: string | null
  inboxHandle?: string | null
  sources?: string[] | null
}

type FeedRow = {
  id: string
  title?: string | null
  url?: string | null
  siteUrl?: string | null
}

type SubscriptionRow = {
  id: string
  type?: "feed" | "list" | "inbox"
  feedId?: string | null
  title?: string | null
  category?: string | null
}

const unknownFeedTitle = "Unknown Feed"

const normalizeEntryIds = (entryIds: string[]) => {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const entryId of entryIds) {
    const id = entryId.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    normalized.push(id)
  }

  if (normalized.length === 0) {
    throw new AgentApplicationError(
      "SUHUI_INVALID_ENTRY_IDS",
      "entryIds must include at least one non-empty id",
      400,
    )
  }

  return normalized
}

const sourceIdForSubscription = (subscription: SubscriptionRow) => {
  if (subscription.type === "feed") return subscription.feedId ?? null
  return null
}

const buildFeedContext = async () => {
  const [feeds, subscriptions] = await Promise.all([
    FeedService.getFeedAll() as Promise<FeedRow[]>,
    SubscriptionService.getSubscriptionAll() as Promise<SubscriptionRow[]>,
  ])

  const feedById = new Map(feeds.map((feed) => [feed.id, feed]))
  const subscriptionByFeedId = new Map<string, SubscriptionRow>()

  for (const subscription of subscriptions) {
    const feedId = sourceIdForSubscription(subscription)
    if (feedId) subscriptionByFeedId.set(feedId, subscription)
  }

  return { feedById, subscriptionByFeedId, subscriptions }
}

const getFeedTitle = (
  feedId: string | null | undefined,
  feedById: Map<string, FeedRow>,
  subscriptionByFeedId: Map<string, SubscriptionRow>,
) => {
  if (!feedId) return unknownFeedTitle
  const subscriptionTitle = subscriptionByFeedId.get(feedId)?.title?.trim()
  if (subscriptionTitle) return subscriptionTitle
  const feedTitle = feedById.get(feedId)?.title?.trim()
  if (feedTitle) return feedTitle
  return feedId
}

const mapEntryListItem = (
  entry: EntryRow,
  feedById: Map<string, FeedRow>,
  subscriptionByFeedId: Map<string, SubscriptionRow>,
  withSummary: boolean,
): AgentEntryListItem => {
  const item: AgentEntryListItem = {
    id: entry.id,
    feedId: entry.feedId ?? null,
    feedTitle: getFeedTitle(entry.feedId, feedById, subscriptionByFeedId),
    title: entry.title?.trim() || "(Untitled)",
    url: entry.url ?? null,
    author: entry.author ?? null,
    publishedAt: entry.publishedAt,
    publishedAtIso: toIsoString(entry.publishedAt),
    insertedAt: entry.insertedAt,
    insertedAtIso: toIsoString(entry.insertedAt),
    read: entry.read === true,
  }

  if (withSummary) {
    item.summary = entry.description ?? null
  }

  return item
}

const toCursorShape = (entry: EntryRow) => ({
  publishedAt: entry.publishedAt,
  insertedAt: entry.insertedAt,
  id: entry.id,
})

const createCursorWhere = (
  entries: {
    publishedAt: AnyColumn
    insertedAt: AnyColumn
    id: AnyColumn
  },
  cursor: ReturnType<typeof decodeAgentEntriesCursor> | null,
) => {
  if (!cursor) return undefined

  return or(
    lt(entries.publishedAt, cursor.publishedAt),
    and(eq(entries.publishedAt, cursor.publishedAt), lt(entries.insertedAt, cursor.insertedAt)),
    and(
      eq(entries.publishedAt, cursor.publishedAt),
      eq(entries.insertedAt, cursor.insertedAt),
      lt(entries.id, cursor.id),
    ),
  )
}

const createActiveVisibilityWhere = (
  entries: {
    feedId: AnyColumn
    inboxHandle: AnyColumn
    sources: AnyColumn
  },
  visibility: ActiveVisibilityState,
) => {
  const conditions = []
  const feedIds = Array.from(visibility.activeFeedIds)
  const inboxIds = Array.from(visibility.activeInboxIds)
  const sourceIds = Array.from(
    new Set([
      ...visibility.activeFeedIds,
      ...visibility.activeListIds,
      ...visibility.activeInboxIds,
    ]),
  )

  if (feedIds.length > 0) {
    conditions.push(inArray(entries.feedId, feedIds))
  }
  if (inboxIds.length > 0) {
    conditions.push(inArray(entries.inboxHandle, inboxIds))
  }
  if (sourceIds.length > 0) {
    conditions.push(
      sql`${entries.sources} ?| array[${sql.join(
        sourceIds.map((id) => sql`${id}`),
        sql`, `,
      )}]`,
    )
  }

  if (conditions.length === 0) return sql`false`
  return conditions.length === 1 ? conditions[0]! : or(...conditions)
}

export class AgentApplicationService {
  async listEntries(options: AgentEntriesListOptions = {}): Promise<AgentEntriesListResult> {
    const db = DBManager.getDB()
    const limit = normalizeLimit(options.limit)
    const [visibility, feedContext] = await Promise.all([
      getActiveVisibilityState(),
      buildFeedContext(),
    ])

    const cursor = options.cursor ? decodeAgentEntriesCursor(options.cursor) : null
    const rows = (await db.query.entriesTable.findMany({
      where: (entries) =>
        and(
          isNull(entries.deletedAt),
          createActiveVisibilityWhere(entries, visibility),
          options.feedId ? eq(entries.feedId, options.feedId) : undefined,
          typeof options.read === "boolean" ? eq(entries.read, options.read) : undefined,
          createCursorWhere(entries, cursor),
        ),
      orderBy: (entries, { desc }) => [
        desc(entries.publishedAt),
        desc(entries.insertedAt),
        desc(entries.id),
      ],
      limit: limit + 1,
    })) as EntryRow[]

    const visibleRows = rows.filter((entry) => isEntryVisibleForActiveRelations(entry, visibility))

    const pageRows = visibleRows.slice(0, limit)
    const hasMore = visibleRows.length > limit
    const lastRow = pageRows.at(-1)

    return {
      items: pageRows.map((entry) =>
        mapEntryListItem(
          entry,
          feedContext.feedById,
          feedContext.subscriptionByFeedId,
          options.withSummary === true,
        ),
      ),
      page: {
        limit,
        hasMore,
        nextCursor: hasMore && lastRow ? encodeAgentEntriesCursor(toCursorShape(lastRow)) : null,
      },
    }
  }

  async getEntry(entryId: string): Promise<AgentEntryDetail | null> {
    const db = DBManager.getDB()
    const entry =
      ((await db.query.entriesTable.findFirst({
        where: (entries) => and(eq(entries.id, entryId), isNull(entries.deletedAt)),
      })) as EntryRow | undefined) ?? null

    if (!entry) return null

    const [visibility, feedContext] = await Promise.all([
      getActiveVisibilityState(),
      buildFeedContext(),
    ])

    if (!isEntryVisibleForActiveRelations(entry, visibility)) return null

    const selectedContent = selectAgentEntryContent(entry)
    return {
      ...mapEntryListItem(entry, feedContext.feedById, feedContext.subscriptionByFeedId, false),
      description: entry.description ?? null,
      content: selectedContent.content,
      contentSource: selectedContent.contentSource,
    }
  }

  async listFeeds(): Promise<AgentFeedsListResult> {
    const [{ feedById, subscriptions }, unreadCounts] = await Promise.all([
      buildFeedContext(),
      unreadApplicationService.listUnreadCounts(),
    ])
    const unreadCountById = new Map(unreadCounts.map((unread) => [unread.id, unread.count]))

    return {
      items: subscriptions.flatMap((subscription) => {
        const feedId = sourceIdForSubscription(subscription)
        if (!feedId) return []
        const feed = feedById.get(feedId)
        const title =
          subscription.title?.trim() || feed?.title?.trim() || feedId || unknownFeedTitle

        return [
          {
            id: feedId,
            subscriptionId: subscription.id,
            title,
            url: feed?.url ?? null,
            siteUrl: feed?.siteUrl ?? null,
            category: subscription.category ?? null,
            unreadCount: unreadCountById.get(feedId) ?? 0,
          },
        ]
      }),
    }
  }

  async updateReadStatus(payload: {
    entryIds: string[]
    read: boolean
  }): Promise<AgentReadStatusResult> {
    const entryIds = normalizeEntryIds(payload.entryIds)
    const { read } = payload
    const db = DBManager.getDB()
    const existingRows = (await db.query.entriesTable.findMany({
      where: (entries) => and(inArray(entries.id, entryIds), isNull(entries.deletedAt)),
      columns: { id: true },
    })) as Array<{ id: string }>
    const existingIds = new Set(existingRows.map((entry) => entry.id))
    const targetEntryIds = entryIds.filter((entryId) => existingIds.has(entryId))

    if (targetEntryIds.length === 0) {
      return {
        updated: 0,
        read,
      }
    }

    await EntryService.patchMany({
      entryIds: targetEntryIds,
      entry: { read },
    })

    for (const entryId of targetEntryIds) {
      syncLogger.record({
        type: read ? "entry.mark_read" : "entry.mark_unread",
        entityType: "entry",
        entityId: entryId,
      })
    }

    return {
      updated: targetEntryIds.length,
      read,
    }
  }
}

export const agentApplicationService = new AgentApplicationService()
