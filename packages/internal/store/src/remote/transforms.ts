/**
 * 远程端 API 数据转换器
 * 将 HTTP API 返回的数据格式转换为 Store Model 格式
 */

import type { FeedViewType } from "@suhui/constants"

// ============ API 响应类型定义 ============

/** API 返回的订阅记录格式 */
export type SubscriptionRecord = {
  id: string
  type?: string
  category?: string | null
  title?: string | null
  feedId?: string | null
  view?: number | null
}

/** API 返回的条目记录格式 */
export type EntryRecord = {
  id: string
  title?: string | null
  feedId?: string | null
  read?: boolean | null
  publishedAt?: number | null
  content?: string | null
  readabilityContent?: string | null
  description?: string | null
  url?: string | null
  author?: string | null
  authorUrl?: string | null
  authorAvatar?: string | null
  guid?: string | null
  media?: any[]
  categories?: string[]
  attachments?: any[]
  extra?: any
  language?: string | null
  insertedAt?: number | null
}

/** API 返回的未读记录格式 */
export type UnreadRecord = {
  id: string // feedId
  count: number
}

// ============ Store Model 类型导入 ============

import type { SubscriptionModel } from "../modules/subscription/types"
import type { EntryModel } from "../modules/entry/types"
import type { FeedModel } from "../modules/feed/types"

// ============ 转换器实现 ============

/**
 * 将 API 订阅记录转换为 Store SubscriptionModel
 */
export function transformSubscriptionFromApi(record: SubscriptionRecord): SubscriptionModel {
  return {
    type: (record.type as "feed" | "list" | "inbox") || "feed",
    feedId: record.feedId || null,
    listId: null,
    inboxId: null,
    userId: "remote-user", // 远程端使用固定用户 ID
    view: (record.view as FeedViewType) ?? 0,
    isPrivate: false,
    hideFromTimeline: false,
    title: record.title || null,
    category: record.category || null,
    createdAt: new Date().toISOString(),
  }
}

/**
 * 将 API 条目记录转换为 Store EntryModel
 */
export function transformEntryFromApi(record: EntryRecord): EntryModel {
  const normalizeTime = (value: number | null | undefined): number => {
    if (value === null || value === undefined) return Date.now()
    return value
  }

  return {
    id: record.id,
    title: record.title || null,
    url: record.url || null,
    content: record.content || null,
    readabilityContent: record.readabilityContent || null,
    readabilityUpdatedAt: null,
    description: record.description || null,
    guid: record.guid || record.id,
    author: record.author || null,
    authorUrl: record.authorUrl || null,
    authorAvatar: record.authorAvatar || null,
    insertedAt: normalizeTime(record.insertedAt),
    publishedAt: normalizeTime(record.publishedAt),
    media: record.media || null,
    categories: record.categories || null,
    attachments: record.attachments || null,
    extra: record.extra || null,
    language: record.language || null,
    feedId: record.feedId || null,
    inboxHandle: null,
    read: record.read ?? false,
    sources: null,
    settings: null,
  }
}

/**
 * 将 API 未读记录转换为 Store 格式
 */
export function transformUnreadFromApi(record: UnreadRecord): { id: string; count: number } {
  return {
    id: record.id, // API 返回的 id 就是 feedId
    count: record.count,
  }
}

/**
 * 从订阅记录中提取 Feed 信息
 */
export function extractFeedFromSubscription(
  record: SubscriptionRecord,
): (Partial<FeedModel> & { id: string }) | null {
  if (!record.feedId) return null

  return {
    id: record.feedId,
    title: record.title || null,
    url: "", // API 未返回 feed URL，后续可通过其他方式补全
  }
}

/**
 * 批量转换订阅记录
 */
export function transformSubscriptionsFromApi(records: SubscriptionRecord[]): SubscriptionModel[] {
  return records.map(transformSubscriptionFromApi)
}

/**
 * 批量转换条目记录
 */
export function transformEntriesFromApi(records: EntryRecord[]): EntryModel[] {
  return records.map(transformEntryFromApi)
}

/**
 * 批量转换未读记录
 */
export function transformUnreadsFromApi(
  records: UnreadRecord[],
): Array<{ id: string; count: number }> {
  return records.map(transformUnreadFromApi)
}

/**
 * 从订阅列表中提取所有 Feed 信息
 */
export function extractFeedsFromSubscriptions(
  records: SubscriptionRecord[],
): Array<Partial<FeedModel> & { id: string }> {
  const feeds: Array<Partial<FeedModel> & { id: string }> = []
  const seenIds = new Set<string>()

  for (const record of records) {
    const feed = extractFeedFromSubscription(record)
    if (feed && !seenIds.has(feed.id)) {
      seenIds.add(feed.id)
      feeds.push(feed)
    }
  }

  return feeds
}
