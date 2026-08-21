import * as pgSchema from "./postgres"
import { onRuntimeDbTypeChange } from "./runtime"
import * as sqliteSchema from "./sqlite"

/**
 * 运行时按方言生效的表对象。
 *
 * 用 `export let` + 重新赋值（ES 实时绑定）而不是常量：drizzle 的值编解码挂在列
 * 对象上，用 Postgres 的表去查 SQLite 会把 `true` 原样绑进去而报错。所有 import
 * 方无需改动，重绑对它们自动可见。切换点唯一：`setRuntimeDbType`。
 */
export let { feedsTable } = pgSchema
export let { subscriptionsTable } = pgSchema
export let { inboxesTable } = pgSchema
export let { listsTable } = pgSchema
export let { unreadTable } = pgSchema
export let { usersTable } = pgSchema
export let { entriesTable } = pgSchema
export let { collectionsTable } = pgSchema
export let { summariesTable } = pgSchema
export let { translationsTable } = pgSchema
export let { imagesTable } = pgSchema
export let { aiChatTable } = pgSchema
export let { aiChatMessagesTable } = pgSchema
export let { appliedSyncOpsTable } = pgSchema
export let { pendingSyncOpsTable } = pgSchema
export let { contentClustersTable } = pgSchema
export let { contentClusterMembersTable } = pgSchema
export let { contentClusterExclusionsTable } = pgSchema
export let { entryRulesTable } = pgSchema
export let { entryRuleApplicationsTable } = pgSchema
export let { entryUserStateTable } = pgSchema
export let { entryTagsTable } = pgSchema
export let { entryNotesTable } = pgSchema
export let { entryHighlightsTable } = pgSchema
export let { readingQueueTable } = pgSchema
export let { backupRestoreSettingsTable } = pgSchema
export let { contentClusterRebuildStateTable } = pgSchema

onRuntimeDbTypeChange((dbType) => {
  const active = dbType === "sqlite" ? sqliteSchema : pgSchema
  feedsTable = active.feedsTable as typeof feedsTable
  subscriptionsTable = active.subscriptionsTable as typeof subscriptionsTable
  inboxesTable = active.inboxesTable as typeof inboxesTable
  listsTable = active.listsTable as typeof listsTable
  unreadTable = active.unreadTable as typeof unreadTable
  usersTable = active.usersTable as typeof usersTable
  entriesTable = active.entriesTable as typeof entriesTable
  collectionsTable = active.collectionsTable as typeof collectionsTable
  summariesTable = active.summariesTable as typeof summariesTable
  translationsTable = active.translationsTable as typeof translationsTable
  imagesTable = active.imagesTable as typeof imagesTable
  aiChatTable = active.aiChatTable as typeof aiChatTable
  aiChatMessagesTable = active.aiChatMessagesTable as typeof aiChatMessagesTable
  appliedSyncOpsTable = active.appliedSyncOpsTable as typeof appliedSyncOpsTable
  pendingSyncOpsTable = active.pendingSyncOpsTable as typeof pendingSyncOpsTable
  contentClustersTable = active.contentClustersTable as typeof contentClustersTable
  contentClusterMembersTable =
    active.contentClusterMembersTable as typeof contentClusterMembersTable
  contentClusterExclusionsTable =
    active.contentClusterExclusionsTable as typeof contentClusterExclusionsTable
  entryRulesTable = active.entryRulesTable as typeof entryRulesTable
  entryRuleApplicationsTable =
    active.entryRuleApplicationsTable as typeof entryRuleApplicationsTable
  entryUserStateTable = active.entryUserStateTable as typeof entryUserStateTable
  entryTagsTable = active.entryTagsTable as typeof entryTagsTable
  entryNotesTable = active.entryNotesTable as typeof entryNotesTable
  entryHighlightsTable = active.entryHighlightsTable as typeof entryHighlightsTable
  readingQueueTable = active.readingQueueTable as typeof readingQueueTable
  backupRestoreSettingsTable =
    active.backupRestoreSettingsTable as typeof backupRestoreSettingsTable
  contentClusterRebuildStateTable =
    active.contentClusterRebuildStateTable as typeof contentClusterRebuildStateTable
})

export * from "./types"

export type AiChatMessagesModel = typeof pgSchema.aiChatMessagesTable.$inferSelect
