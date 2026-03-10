import * as pgSchema from "./postgres"
import { getRuntimeDbType } from "./runtime"
import * as sqliteSchema from "./sqlite"

const activeSchema = getRuntimeDbType() === "postgres" ? pgSchema : sqliteSchema

export const { feedsTable } = activeSchema
export const { subscriptionsTable } = activeSchema
export const { inboxesTable } = activeSchema
export const { listsTable } = activeSchema
export const { unreadTable } = activeSchema
export const { usersTable } = activeSchema
export const { entriesTable } = activeSchema
export const { collectionsTable } = activeSchema
export const { summariesTable } = activeSchema
export const { translationsTable } = activeSchema
export const { imagesTable } = activeSchema
export const { aiChatTable } = activeSchema
export const { aiChatMessagesTable } = activeSchema
export const { appliedSyncOpsTable } = activeSchema
export const { pendingSyncOpsTable } = activeSchema

export * from "./types"

export type AiChatMessagesModel = typeof sqliteSchema.aiChatMessagesTable.$inferSelect
