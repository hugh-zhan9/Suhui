import type { FeedViewType } from "@suhui/constants"
import type { SupportedActionLanguage } from "@suhui/shared/language"
import type { EntrySettings } from "@follow-app/client-sdk"
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type { AttachmentsModel, ExtraModel, ImageColorsResult, MediaModel } from "./types"

export const feedsTable = pgTable("feeds", {
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
  tipUserIds: jsonb("tip_users").$type<string[]>(),
  updatedAt: bigint("published_at", { mode: "number" }),
  deletedAt: bigint("deleted_at", { mode: "number" }),
})

export const subscriptionsTable = pgTable("subscriptions", {
  feedId: text("feed_id"),
  listId: text("list_id"),
  inboxId: text("inbox_id"),
  userId: text("user_id").notNull(),
  view: integer("view").notNull().$type<FeedViewType>(),
  isPrivate: boolean("is_private").notNull(),
  hideFromTimeline: boolean("hide_from_timeline"),
  title: text("title"),
  category: text("category"),
  createdAt: text("created_at"),
  deletedAt: bigint("deleted_at", { mode: "number" }),
  type: text("type").notNull().$type<"feed" | "list" | "inbox">(),
  id: text("id").primaryKey(),
})

export const inboxesTable = pgTable("inboxes", {
  id: text("id").primaryKey(),
  title: text("title"),
  secret: text("secret").notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
})

export const listsTable = pgTable("lists", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  title: text("title").notNull(),
  feedIds: jsonb("feed_ids").$type<string>(),
  description: text("description"),
  view: integer("view").notNull().$type<FeedViewType>(),
  image: text("image"),
  fee: integer("fee"),
  ownerUserId: text("owner_user_id"),
  subscriptionCount: integer("subscription_count"),
  purchaseAmount: text("purchase_amount"),
  deletedAt: bigint("deleted_at", { mode: "number" }),
})

export const unreadTable = pgTable("unread", {
  id: text("subscription_id").notNull().primaryKey(),
  count: integer("count").notNull(),
})

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  handle: text("handle"),
  name: text("name"),
  image: text("image"),
  isMe: boolean("is_me"),
  emailVerified: boolean("email_verified"),
  bio: text("bio"),
  website: text("website"),
  socialLinks: jsonb("social_links").$type<{
    twitter?: string
    github?: string
    instagram?: string
    facebook?: string
    youtube?: string
    discord?: string
  }>(),
})

export const entriesTable = pgTable("entries", {
  id: text("id").primaryKey(),
  title: text("title"),
  url: text("url"),
  content: text("content"),
  readabilityContent: text("source_content"),
  readabilityUpdatedAt: bigint("readability_updated_at", { mode: "number" }),
  description: text("description"),
  guid: text("guid").notNull(),
  author: text("author"),
  authorUrl: text("author_url"),
  authorAvatar: text("author_avatar"),
  insertedAt: bigint("inserted_at", { mode: "number" }).notNull(),
  publishedAt: bigint("published_at", { mode: "number" }).notNull(),
  media: jsonb("media").$type<MediaModel[]>(),
  categories: jsonb("categories").$type<string[]>(),
  attachments: jsonb("attachments").$type<AttachmentsModel[]>(),
  extra: jsonb("extra").$type<ExtraModel>(),
  language: text("language"),

  feedId: text("feed_id"),

  inboxHandle: text("inbox_handle"),
  read: boolean("read"),
  sources: jsonb("sources").$type<string[]>(),
  settings: jsonb("settings").$type<EntrySettings>(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
})

export const collectionsTable = pgTable("collections", {
  feedId: text("feed_id"),
  entryId: text("entry_id").notNull().primaryKey(),
  createdAt: text("created_at"),
  view: integer("view").notNull().$type<FeedViewType>(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
})

export const summariesTable = pgTable(
  "summaries",
  {
    entryId: text("entry_id").notNull(),
    summary: text("summary").notNull(),
    readabilitySummary: text("readability_summary"),
    createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
    language: text("language").$type<SupportedActionLanguage>(),
  },
  (t) => [uniqueIndex("unq").on(t.entryId, t.language)],
)

export const translationsTable = pgTable(
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

export const imagesTable = pgTable("images", (t) => ({
  url: t.text("url").notNull().primaryKey(),
  colors: t.jsonb("colors").$type<ImageColorsResult>().notNull(),
  createdAt: t
    .bigint("created_at", { mode: "number" })
    .notNull()
    .default(sql`(extract(epoch from now()) * 1000)::bigint`),
}))

export const aiChatTable = pgTable(
  "ai_chat_sessions",
  (t) => ({
    chatId: t.text("id").notNull().primaryKey(),
    title: t.text("title"),
    createdAt: t
      .bigint("created_at", { mode: "number" })
      .notNull()
      .default(sql`(extract(epoch from now()) * 1000)::bigint`),
    updatedAt: t
      .bigint("updated_at", { mode: "number" })
      .notNull()
      .default(sql`(extract(epoch from now()) * 1000)::bigint`),
    isLocal: t.boolean("is_local").notNull().default(false),
  }),
  (table) => [index("idx_ai_chat_sessions_updated_at").on(table.updatedAt)],
)

export const aiChatMessagesTable = pgTable(
  "ai_chat_messages",
  (t) => ({
    id: t.text("id").notNull().primaryKey(),
    chatId: t
      .text("chat_id")
      .notNull()
      .references(() => aiChatTable.chatId, { onDelete: "cascade" }),

    role: t.text("role").notNull().$type<"user" | "assistant" | "system">(),

    createdAt: t
      .bigint("created_at", { mode: "number" })
      .notNull()
      .default(sql`(extract(epoch from now()) * 1000)::bigint`),
    metadata: t.jsonb("metadata").$type<any>(),

    status: t
      .text("status")
      .$type<"pending" | "streaming" | "completed" | "error">()
      .default("completed"),
    finishedAt: t.bigint("finished_at", { mode: "number" }),

    messageParts: t.jsonb("message_parts").$type<unknown[]>(),
  }),
  (table) => [
    index("idx_ai_chat_messages_chat_id_created_at").on(table.chatId, table.createdAt),
    index("idx_ai_chat_messages_status").on(table.status),
    index("idx_ai_chat_messages_chat_id_role").on(table.chatId, table.role),
  ],
)

export const appliedSyncOpsTable = pgTable("applied_sync_ops", {
  opId: text("op_id").primaryKey(),
  appliedAt: bigint("applied_at", { mode: "number" }).notNull(),
})

export const pendingSyncOpsTable = pgTable("pending_sync_ops", {
  opId: text("op_id").primaryKey(),
  opJson: text("op_json").notNull(),
  retryAfter: bigint("retry_after", { mode: "number" })
    .notNull()
    .default(sql`0`),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  status: text("status")
    .$type<"pending" | "expired" | "failed" | "applied">()
    .notNull()
    .default("pending"),
  updatedAt: bigint("updated_at", { mode: "number" }),
  appliedAt: bigint("applied_at", { mode: "number" }),
})

export type AiChatMessagesModel = typeof aiChatMessagesTable.$inferSelect
