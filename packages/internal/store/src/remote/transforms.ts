/**
 * 远程端 API 数据转换器
 * 将 HTTP API 返回的数据格式转换为 Store Model 格式
 */

import { FeedViewType } from "@suhui/constants"

import type { RemoteBootstrapPayload, RemoteSettings } from "./bootstrap"

// ============ API 响应类型定义 ============

/** API 返回的订阅记录格式 */
export type SubscriptionRecord = {
  id: string
  type: "feed" | "list" | "inbox"
  category?: string | null
  title?: string | null
  feedId?: string | null
  listId?: string | null
  inboxId?: string | null
  view: number
  createdAt?: string | null
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
  readabilityUpdatedAt?: number | null
  inboxHandle?: string | null
  sources?: string[] | null
  settings?: any
  recordKind?: "summary" | "detail"
}

/** API 返回的未读记录格式 */
export type UnreadRecord = {
  id: string // feedId
  count: number
}

/** API 返回的收藏记录格式 */
export type CollectionRecord = {
  entryId: string
  feedId?: string | null
  view: number
  createdAt?: string | null
}

const REMOTE_BOOTSTRAP_KEYS = [
  "subscriptions",
  "feeds",
  "unread",
  "collections",
  "settings",
  "capabilities",
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const feedViewValues = new Set<number>(
  Object.values(FeedViewType).filter((value): value is number => typeof value === "number"),
)

const isFeedView = (value: unknown): value is FeedViewType =>
  typeof value === "number" && Number.isInteger(value) && feedViewValues.has(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const isAbsent = (value: unknown): value is null | undefined =>
  value === undefined || value === null

const invalidBootstrap = (group: string): never => {
  throw new Error(`Invalid remote bootstrap: ${group}`)
}

const hasOptionalType = (record: Record<string, unknown>, key: string, type: "string" | "number") =>
  record[key] === undefined || record[key] === null || typeof record[key] === type

const hasOptionalNonEmptyString = (record: Record<string, unknown>, key: string) =>
  isAbsent(record[key]) || isNonEmptyString(record[key])

const hasMatchingSubscriptionSource = (record: Record<string, unknown>): boolean => {
  switch (record.type) {
    case "feed":
      return isNonEmptyString(record.feedId) && isAbsent(record.listId) && isAbsent(record.inboxId)
    case "list":
      return isAbsent(record.feedId) && isNonEmptyString(record.listId) && isAbsent(record.inboxId)
    case "inbox":
      return isAbsent(record.feedId) && isAbsent(record.listId) && isNonEmptyString(record.inboxId)
    default:
      return false
  }
}

const isSubscriptionRecord = (value: unknown): value is SubscriptionRecord =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  hasOptionalType(value, "category", "string") &&
  hasOptionalType(value, "title", "string") &&
  hasOptionalNonEmptyString(value, "feedId") &&
  hasOptionalNonEmptyString(value, "listId") &&
  hasOptionalNonEmptyString(value, "inboxId") &&
  isFeedView(value.view) &&
  hasOptionalType(value, "createdAt", "string") &&
  hasMatchingSubscriptionSource(value)

const isFeedRecord = (value: unknown): value is RemoteBootstrapPayload["feeds"][number] =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  hasOptionalType(value, "title", "string") &&
  hasOptionalType(value, "url", "string")

const isUnreadRecord = (value: unknown): value is UnreadRecord =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  typeof value.count === "number" &&
  Number.isInteger(value.count) &&
  value.count >= 0

const isCollectionRecord = (value: unknown): value is CollectionRecord =>
  isRecord(value) &&
  isNonEmptyString(value.entryId) &&
  hasOptionalNonEmptyString(value, "feedId") &&
  isFeedView(value.view) &&
  hasOptionalType(value, "createdAt", "string")

const isRemoteSettings = (value: unknown): value is RemoteSettings =>
  isRecord(value) &&
  (value.appearance === "light" || value.appearance === "dark" || value.appearance === "system") &&
  typeof value.rsshubCustomUrl === "string"

export function parseRemoteBootstrapPayload(value: unknown): RemoteBootstrapPayload {
  if (!isRecord(value)) return invalidBootstrap("payload")
  const payload = value
  const keys = Object.keys(payload)
  if (
    keys.length !== REMOTE_BOOTSTRAP_KEYS.length ||
    REMOTE_BOOTSTRAP_KEYS.some((key) => !Object.hasOwn(payload, key))
  ) {
    invalidBootstrap("metadata groups")
  }
  if (!Array.isArray(payload.subscriptions) || !payload.subscriptions.every(isSubscriptionRecord)) {
    invalidBootstrap("subscriptions")
  }
  if (!Array.isArray(payload.feeds) || !payload.feeds.every(isFeedRecord)) {
    invalidBootstrap("feeds")
  }
  if (!Array.isArray(payload.unread) || !payload.unread.every(isUnreadRecord)) {
    invalidBootstrap("unread")
  }
  if (!Array.isArray(payload.collections) || !payload.collections.every(isCollectionRecord)) {
    invalidBootstrap("collections")
  }
  if (!isRemoteSettings(payload.settings)) invalidBootstrap("settings")
  if (!isRecord(payload.capabilities)) invalidBootstrap("capabilities")

  return payload as RemoteBootstrapPayload
}

// ============ Store Model 类型导入 ============

import type { SubscriptionModel } from "../modules/subscription/types"
import type { EntryModel } from "../modules/entry/types"
import type { FeedModel } from "../modules/feed/types"
import type { CollectionSchema } from "../../../database/src/schemas/types"

// ============ 转换器实现 ============

/**
 * 将 API 订阅记录转换为 Store SubscriptionModel
 */
export function transformSubscriptionFromApi(record: SubscriptionRecord): SubscriptionModel {
  return {
    type: record.type,
    feedId: record.feedId ?? null,
    listId: record.listId ?? null,
    inboxId: record.inboxId ?? null,
    userId: "remote-user", // 远程端使用固定用户 ID
    view: record.view as FeedViewType,
    isPrivate: false,
    hideFromTimeline: false,
    title: record.title || null,
    category: record.category || null,
    createdAt: record.createdAt || new Date(0).toISOString(),
  }
}

/**
 * 将 API 条目记录转换为 Store EntryModel
 */
export function transformEntryFromApi(record: EntryRecord): EntryModel {
  const normalizeTime = (value: number | null | undefined): number => {
    if (value === null || value === undefined) return 0
    return value
  }

  return {
    id: record.id,
    title: record.title || null,
    url: record.url || null,
    content: record.content || null,
    readabilityContent: record.readabilityContent || null,
    readabilityUpdatedAt: record.readabilityUpdatedAt ?? null,
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
    inboxHandle: record.inboxHandle ?? null,
    read: record.read ?? false,
    sources: record.sources ?? null,
    settings: record.settings ?? null,
    recordKind: record.recordKind,
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

export function transformCollectionFromApi(record: CollectionRecord): CollectionSchema {
  return {
    entryId: record.entryId,
    feedId: record.feedId ?? null,
    view: record.view as CollectionSchema["view"],
    createdAt: record.createdAt || new Date(0).toISOString(),
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

export function transformCollectionsFromApi(records: CollectionRecord[]): CollectionSchema[] {
  return records.map(transformCollectionFromApi)
}

export function transformRemoteBootstrapFromApi(value: unknown) {
  const payload = parseRemoteBootstrapPayload(value)
  return {
    subscriptions: transformSubscriptionsFromApi(payload.subscriptions),
    feeds: payload.feeds,
    unread: transformUnreadsFromApi(payload.unread),
    collections: transformCollectionsFromApi(payload.collections),
    settings: payload.settings,
    capabilities: payload.capabilities,
  }
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
