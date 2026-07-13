import { and, inArray, isNull } from "drizzle-orm"
import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"

import { encodeEntryCursor } from "~/application/entry/query-cursor"
import { entryQueryService } from "~/application/entry/query-service"
import { unreadApplicationService } from "~/application/unread/service"
import { DBManager } from "~/manager/db"
import { syncLogger } from "~/manager/sync-logger"

import { decodeAgentEntriesCursor } from "./cursor"
import {
  AgentApplicationError,
  type AgentEntriesListOptions,
  type AgentEntriesListResult,
  type AgentEntryDetail,
  type AgentEntryListItem,
  type AgentFeedsListResult,
  type AgentReadStatusResult,
  agentReadStatusMaxEntryIds,
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

const normalizeEntryIds = (entryIds: unknown) => {
  if (!Array.isArray(entryIds) || entryIds.some((entryId) => typeof entryId !== "string")) {
    throw new AgentApplicationError(
      "SUHUI_INVALID_ENTRY_IDS",
      "entryIds must be a non-empty string array",
      400,
    )
  }

  if (entryIds.length > agentReadStatusMaxEntryIds) {
    throw new AgentApplicationError(
      "SUHUI_INVALID_ENTRY_IDS",
      `entryIds must include at most ${agentReadStatusMaxEntryIds} ids`,
      400,
    )
  }

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

const normalizeReadStatus = (read: unknown) => {
  if (typeof read !== "boolean") {
    throw new AgentApplicationError("SUHUI_INVALID_READ_STATUS", "read must be true or false", 400)
  }

  return read
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

export class AgentApplicationService {
  async listEntries(options: AgentEntriesListOptions = {}): Promise<AgentEntriesListResult> {
    const limit = normalizeLimit(options.limit)
    const incomingCursor = options.cursor ? decodeAgentEntriesCursor(options.cursor) : null
    const [page, feedContext] = await Promise.all([
      entryQueryService.list({
        scope: options.feedId ? { kind: "feeds", feedIds: [options.feedId] } : { kind: "timeline" },
        limit,
        ...(typeof options.read === "boolean" ? { read: options.read } : {}),
        ...(incomingCursor ? { cursor: encodeEntryCursor({ v: 1, ...incomingCursor }) } : {}),
      }),
      buildFeedContext(),
    ])

    return {
      items: page.items.map((entry) =>
        mapEntryListItem(
          entry,
          feedContext.feedById,
          feedContext.subscriptionByFeedId,
          options.withSummary === true,
        ),
      ),
      page: {
        limit,
        hasMore: page.page.hasMore,
        nextCursor: page.page.nextCursor,
      },
    }
  }

  async getEntry(entryId: string): Promise<AgentEntryDetail | null> {
    const entry = (await entryQueryService.getDetail(
      entryId,
      "active-relations",
    )) as EntryRow | null

    if (!entry) return null

    const feedContext = await buildFeedContext()

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
    const read = normalizeReadStatus(payload.read)
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
