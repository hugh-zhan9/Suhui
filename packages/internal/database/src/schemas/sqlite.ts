// 本文件由 scripts/generate-sqlite-schema.mjs 从 postgres.ts 生成，请勿手改。
// 改动 schema 请改 postgres.ts，然后运行：
//   pnpm --filter @suhui/database exec node scripts/generate-sqlite-schema.mjs --write
// 两个方言必须逐列产出相同的 JS 类型，sqlite-schema-parity.test.ts 会校验这一点。
import type { EntrySettings } from "@follow-app/client-sdk"
import type { FeedViewType } from "@suhui/constants"
import type { SupportedActionLanguage } from "@suhui/shared/language"
import { sql } from "drizzle-orm"
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import type { AttachmentsModel, ExtraModel, ImageColorsResult, MediaModel } from "./types"

export const feedsTable = sqliteTable("feeds", {
  id: text("id").primaryKey(),
  title: text("title"),
  url: text("url").notNull(),
  description: text("description"),
  image: text("image"),
  errorAt: text("error_at"),
  siteUrl: text("site_url"),
  ownerUserId: text("owner_user_id"),
  errorMessage: text("error_message"),
  subscriptionCount: integer("subscription_count"),
  updatesPerWeek: integer("updates_per_week"),
  latestEntryPublishedAt: text("latest_entry_published_at"),
  tipUserIds: text("tip_users", { mode: "json" }).$type<string[]>(),
  updatedAt: integer("published_at"),
  deletedAt: integer("deleted_at"),
})

export const subscriptionsTable = sqliteTable("subscriptions", {
  feedId: text("feed_id"),
  listId: text("list_id"),
  inboxId: text("inbox_id"),
  userId: text("user_id").notNull(),
  view: integer("view").notNull().$type<FeedViewType>(),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull(),
  hideFromTimeline: integer("hide_from_timeline", { mode: "boolean" }),
  title: text("title"),
  category: text("category"),
  createdAt: text("created_at"),
  deletedAt: integer("deleted_at"),
  type: text("type").notNull().$type<"feed" | "list" | "inbox">(),
  id: text("id").primaryKey(),
})

export const inboxesTable = sqliteTable("inboxes", {
  id: text("id").primaryKey(),
  title: text("title"),
  secret: text("secret").notNull(),
  deletedAt: integer("deleted_at"),
})

export const listsTable = sqliteTable("lists", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  title: text("title").notNull(),
  feedIds: text("feed_ids", { mode: "json" }).$type<string>(),
  description: text("description"),
  view: integer("view").notNull().$type<FeedViewType>(),
  image: text("image"),
  fee: integer("fee"),
  ownerUserId: text("owner_user_id"),
  subscriptionCount: integer("subscription_count"),
  purchaseAmount: text("purchase_amount"),
  deletedAt: integer("deleted_at"),
})

export const unreadTable = sqliteTable("unread", {
  id: text("subscription_id").notNull().primaryKey(),
  count: integer("count").notNull(),
})

export const usersTable = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  handle: text("handle"),
  name: text("name"),
  image: text("image"),
  isMe: integer("is_me", { mode: "boolean" }),
  emailVerified: integer("email_verified", { mode: "boolean" }),
  bio: text("bio"),
  website: text("website"),
  socialLinks: text("social_links", { mode: "json" }).$type<{
    twitter?: string
    github?: string
    instagram?: string
    facebook?: string
    youtube?: string
    discord?: string
  }>(),
})

export const entriesTable = sqliteTable("entries", {
  id: text("id").primaryKey(),
  title: text("title"),
  url: text("url"),
  content: text("content"),
  readabilityContent: text("source_content"),
  readabilityUpdatedAt: integer("readability_updated_at"),
  description: text("description"),
  guid: text("guid").notNull(),
  author: text("author"),
  authorUrl: text("author_url"),
  authorAvatar: text("author_avatar"),
  insertedAt: integer("inserted_at").notNull(),
  publishedAt: integer("published_at").notNull(),
  media: text("media", { mode: "json" }).$type<MediaModel[]>(),
  categories: text("categories", { mode: "json" }).$type<string[]>(),
  attachments: text("attachments", { mode: "json" }).$type<AttachmentsModel[]>(),
  extra: text("extra", { mode: "json" }).$type<ExtraModel>(),
  language: text("language"),

  feedId: text("feed_id"),

  inboxHandle: text("inbox_handle"),
  read: integer("read", { mode: "boolean" }),
  sources: text("sources", { mode: "json" }).$type<string[]>(),
  settings: text("settings", { mode: "json" }).$type<EntrySettings>(),
  deletedAt: integer("deleted_at"),
})

export const collectionsTable = sqliteTable("collections", {
  feedId: text("feed_id"),
  entryId: text("entry_id").notNull().primaryKey(),
  createdAt: text("created_at"),
  view: integer("view").notNull().$type<FeedViewType>(),
  deletedAt: integer("deleted_at"),
})

export const summariesTable = sqliteTable(
  "summaries",
  {
    entryId: text("entry_id").notNull(),
    summary: text("summary").notNull(),
    readabilitySummary: text("readability_summary"),
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
    language: text("language").notNull().default("").$type<SupportedActionLanguage | "">(),
  },
  (t) => [uniqueIndex("unq").on(t.entryId, t.language)],
)

export const translationsTable = sqliteTable(
  "translations",
  (t) => ({
    entryId: t.text("entry_id").notNull(),
    language: t.text("language").$type<SupportedActionLanguage>().notNull(),
    title: t.text("title"),
    description: t.text("description"),
    content: t.text("content"),
    readabilityContent: t.text("readability_content"),
    createdAt: t
      .text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  }),
  (t) => [uniqueIndex("translation-unique-index").on(t.entryId, t.language)],
)

export const imagesTable = sqliteTable("images", (t) => ({
  url: t.text("url").notNull().primaryKey(),
  colors: t.text("colors", { mode: "json" }).$type<ImageColorsResult>().notNull(),
  createdAt: t
    .integer("created_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
}))

export const aiChatTable = sqliteTable(
  "ai_chat_sessions",
  (t) => ({
    chatId: t.text("id").notNull().primaryKey(),
    title: t.text("title"),
    createdAt: t
      .integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: t
      .integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    isLocal: t.integer("is_local", { mode: "boolean" }).notNull().default(false),
  }),
  (table) => [index("idx_ai_chat_sessions_updated_at").on(table.updatedAt)],
)

export const aiChatMessagesTable = sqliteTable(
  "ai_chat_messages",
  (t) => ({
    id: t.text("id").notNull().primaryKey(),
    chatId: t
      .text("chat_id")
      .notNull()
      .references(() => aiChatTable.chatId, { onDelete: "cascade" }),

    role: t.text("role").notNull().$type<"user" | "assistant" | "system">(),

    createdAt: t
      .integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    metadata: t.text("metadata", { mode: "json" }).$type<any>(),

    status: t
      .text("status")
      .$type<"pending" | "streaming" | "completed" | "error">()
      .default("completed"),
    finishedAt: t.integer("finished_at"),

    messageParts: t.text("message_parts", { mode: "json" }).$type<unknown[]>(),
  }),
  (table) => [
    index("idx_ai_chat_messages_chat_id_created_at").on(table.chatId, table.createdAt),
    index("idx_ai_chat_messages_status").on(table.status),
    index("idx_ai_chat_messages_chat_id_role").on(table.chatId, table.role),
  ],
)

export const appliedSyncOpsTable = sqliteTable("applied_sync_ops", {
  opId: text("op_id").primaryKey(),
  appliedAt: integer("applied_at").notNull(),
})

export const pendingSyncOpsTable = sqliteTable("pending_sync_ops", {
  opId: text("op_id").primaryKey(),
  opJson: text("op_json").notNull(),
  retryAfter: integer("retry_after")
    .notNull()
    .default(sql`0`),
  createdAt: integer("created_at").notNull(),
  status: text("status")
    .$type<"pending" | "expired" | "failed" | "applied">()
    .notNull()
    .default("pending"),
  updatedAt: integer("updated_at"),
  appliedAt: integer("applied_at"),
})

export type EntryRuleActions = {
  markRead?: boolean
  star?: boolean
  addToReadingQueue?: boolean
  tags?: string[]
  hide?: boolean
}

export const contentClustersTable = sqliteTable("content_clusters", {
  id: text("id").primaryKey(),
  manualRepresentativeEntryId: text("manual_representative_entry_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const contentClusterMembersTable = sqliteTable(
  "content_cluster_members",
  {
    entryId: text("entry_id").primaryKey(),
    clusterId: text("cluster_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    basis: text("basis").notNull().$type<"canonical_url" | "title_content">(),
    algorithmVersion: integer("algorithm_version").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_content_cluster_members_cluster").on(table.clusterId),
    index("idx_content_cluster_members_fingerprint").on(table.fingerprint),
  ],
)

export const contentClusterExclusionsTable = sqliteTable(
  "content_cluster_exclusions",
  {
    entryId: text("entry_id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_content_cluster_exclusions_fingerprint").on(table.fingerprint)],
)

export const entryRulesTable = sqliteTable(
  "entry_rules",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    feedIds: text("feed_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    titleKeywords: text("title_keywords", { mode: "json" }).$type<string[]>().notNull().default([]),
    actions: text("actions", { mode: "json" }).$type<EntryRuleActions>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [index("idx_entry_rules_enabled_updated").on(table.enabled, table.updatedAt)],
)

export const entryRuleApplicationsTable = sqliteTable(
  "entry_rule_applications",
  {
    ruleId: text("rule_id").notNull(),
    entryId: text("entry_id").notNull(),
    ruleVersion: integer("rule_version").notNull(),
    appliedAt: integer("applied_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ruleId, table.entryId, table.ruleVersion] }),
    index("idx_entry_rule_applications_entry").on(table.entryId),
  ],
)

export const entryUserStateTable = sqliteTable("entry_user_state", {
  entryId: text("entry_id").primaryKey(),
  hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull(),
})

export const entryTagsTable = sqliteTable(
  "entry_tags",
  {
    entryId: text("entry_id").notNull(),
    tag: text("tag").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.tag] }),
    index("idx_entry_tags_tag").on(table.tag),
  ],
)

export const entryNotesTable = sqliteTable(
  "entry_notes",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id").notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [index("idx_entry_notes_entry_updated").on(table.entryId, table.updatedAt)],
)

export const entryHighlightsTable = sqliteTable(
  "entry_highlights",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id").notNull(),
    source: text("source").notNull().$type<"rss" | "readability">(),
    quote: text("quote").notNull(),
    prefix: text("prefix").notNull().default(""),
    suffix: text("suffix").notNull().default(""),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    status: text("status").notNull().$type<"active" | "orphaned">().default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [index("idx_entry_highlights_entry_status").on(table.entryId, table.status)],
)

export const readingQueueTable = sqliteTable(
  "reading_queue",
  {
    entryId: text("entry_id").primaryKey(),
    status: text("status").notNull().$type<"pending" | "completed">(),
    addedAt: integer("added_at").notNull(),
    completedAt: integer("completed_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_reading_queue_status_added").on(table.status, table.addedAt),
    index("idx_reading_queue_completed").on(table.completedAt),
  ],
)

/**
 * 恢复流程自己的日志表。此前只以 db.main.ts 的裸 DDL 存在，
 * 访问也全走裸 SQL；补上定义以便两个方言共用同一套类型化访问。
 */
export const backupRestoreSettingsTable = sqliteTable("backup_restore_settings", {
  id: integer("id").primaryKey(),
  settings: text("settings", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  mainApplied: integer("main_applied", { mode: "boolean" }).notNull().default(false),
  rendererApplied: integer("renderer_applied", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
})

/** 聚类重建的中断续跑状态。同样此前只有裸 DDL。 */
export const contentClusterRebuildStateTable = sqliteTable("content_cluster_rebuild_state", {
  id: integer("id").primaryKey(),
  afterEntryId: text("after_entry_id"),
  batchEntryIds: text("batch_entry_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  manualEntryIds: text("manual_entry_ids", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  processed: integer("processed").notNull().default(0),
  clustered: integer("clustered").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
})

export type AiChatMessagesModel = typeof aiChatMessagesTable.$inferSelect
