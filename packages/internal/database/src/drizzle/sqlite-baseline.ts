// 本文件由 scripts/generate-sqlite-baseline.mjs 生成，请勿手改。
// 改 schema 后依次运行：
//   pnpm exec drizzle-kit generate
//   node scripts/generate-sqlite-baseline.mjs --write

export type SqliteMigration = { tag: string; statements: readonly string[] }

export const sqliteMigrations: readonly SqliteMigration[] = [
  {
    tag: "0000_stiff_power_man",
    statements: [
      "CREATE TABLE `ai_chat_messages` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`chat_id` text NOT NULL,\n\t`role` text NOT NULL,\n\t`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,\n\t`metadata` text,\n\t`status` text DEFAULT 'completed',\n\t`finished_at` integer,\n\t`message_parts` text,\n\tFOREIGN KEY (`chat_id`) REFERENCES `ai_chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `idx_ai_chat_messages_chat_id_created_at` ON `ai_chat_messages` (`chat_id`,`created_at`);",
      "CREATE INDEX `idx_ai_chat_messages_status` ON `ai_chat_messages` (`status`);",
      "CREATE INDEX `idx_ai_chat_messages_chat_id_role` ON `ai_chat_messages` (`chat_id`,`role`);",
      "CREATE TABLE `ai_chat_sessions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`title` text,\n\t`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,\n\t`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,\n\t`is_local` integer DEFAULT false NOT NULL\n);",
      "CREATE INDEX `idx_ai_chat_sessions_updated_at` ON `ai_chat_sessions` (`updated_at`);",
      "CREATE TABLE `applied_sync_ops` (\n\t`op_id` text PRIMARY KEY NOT NULL,\n\t`applied_at` integer NOT NULL\n);",
      "CREATE TABLE `backup_restore_settings` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`settings` text NOT NULL,\n\t`main_applied` integer DEFAULT false NOT NULL,\n\t`renderer_applied` integer DEFAULT false NOT NULL,\n\t`created_at` integer NOT NULL\n);",
      "CREATE TABLE `collections` (\n\t`feed_id` text,\n\t`entry_id` text PRIMARY KEY NOT NULL,\n\t`created_at` text,\n\t`view` integer NOT NULL,\n\t`deleted_at` integer\n);",
      "CREATE TABLE `content_cluster_exclusions` (\n\t`entry_id` text PRIMARY KEY NOT NULL,\n\t`fingerprint` text NOT NULL,\n\t`created_at` integer NOT NULL\n);",
      "CREATE INDEX `idx_content_cluster_exclusions_fingerprint` ON `content_cluster_exclusions` (`fingerprint`);",
      "CREATE TABLE `content_cluster_members` (\n\t`entry_id` text PRIMARY KEY NOT NULL,\n\t`cluster_id` text NOT NULL,\n\t`fingerprint` text NOT NULL,\n\t`basis` text NOT NULL,\n\t`algorithm_version` integer NOT NULL,\n\t`created_at` integer NOT NULL\n);",
      "CREATE INDEX `idx_content_cluster_members_cluster` ON `content_cluster_members` (`cluster_id`);",
      "CREATE INDEX `idx_content_cluster_members_fingerprint` ON `content_cluster_members` (`fingerprint`);",
      "CREATE TABLE `content_cluster_rebuild_state` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`after_entry_id` text,\n\t`batch_entry_ids` text DEFAULT '[]' NOT NULL,\n\t`manual_entry_ids` text DEFAULT '[]' NOT NULL,\n\t`processed` integer DEFAULT 0 NOT NULL,\n\t`clustered` integer DEFAULT 0 NOT NULL,\n\t`updated_at` integer NOT NULL\n);",
      "CREATE TABLE `content_clusters` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`manual_representative_entry_id` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL\n);",
      "CREATE TABLE `entries` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`title` text,\n\t`url` text,\n\t`content` text,\n\t`source_content` text,\n\t`readability_updated_at` integer,\n\t`description` text,\n\t`guid` text NOT NULL,\n\t`author` text,\n\t`author_url` text,\n\t`author_avatar` text,\n\t`inserted_at` integer NOT NULL,\n\t`published_at` integer NOT NULL,\n\t`media` text,\n\t`categories` text,\n\t`attachments` text,\n\t`extra` text,\n\t`language` text,\n\t`feed_id` text,\n\t`inbox_handle` text,\n\t`read` integer,\n\t`sources` text,\n\t`settings` text,\n\t`deleted_at` integer\n);",
      "CREATE TABLE `entry_highlights` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`entry_id` text NOT NULL,\n\t`source` text NOT NULL,\n\t`quote` text NOT NULL,\n\t`prefix` text DEFAULT '' NOT NULL,\n\t`suffix` text DEFAULT '' NOT NULL,\n\t`start_offset` integer,\n\t`end_offset` integer,\n\t`status` text DEFAULT 'active' NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`deleted_at` integer\n);",
      "CREATE INDEX `idx_entry_highlights_entry_status` ON `entry_highlights` (`entry_id`,`status`);",
      "CREATE TABLE `entry_notes` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`entry_id` text NOT NULL,\n\t`content` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`deleted_at` integer\n);",
      "CREATE INDEX `idx_entry_notes_entry_updated` ON `entry_notes` (`entry_id`,`updated_at`);",
      "CREATE TABLE `entry_rule_applications` (\n\t`rule_id` text NOT NULL,\n\t`entry_id` text NOT NULL,\n\t`rule_version` integer NOT NULL,\n\t`applied_at` integer NOT NULL,\n\tPRIMARY KEY(`rule_id`, `entry_id`, `rule_version`)\n);",
      "CREATE INDEX `idx_entry_rule_applications_entry` ON `entry_rule_applications` (`entry_id`);",
      "CREATE TABLE `entry_rules` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`enabled` integer DEFAULT true NOT NULL,\n\t`feed_ids` text DEFAULT '[]' NOT NULL,\n\t`title_keywords` text DEFAULT '[]' NOT NULL,\n\t`actions` text NOT NULL,\n\t`version` integer DEFAULT 1 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`deleted_at` integer\n);",
      "CREATE INDEX `idx_entry_rules_enabled_updated` ON `entry_rules` (`enabled`,`updated_at`);",
      "CREATE TABLE `entry_tags` (\n\t`entry_id` text NOT NULL,\n\t`tag` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`entry_id`, `tag`)\n);",
      "CREATE INDEX `idx_entry_tags_tag` ON `entry_tags` (`tag`);",
      "CREATE TABLE `entry_user_state` (\n\t`entry_id` text PRIMARY KEY NOT NULL,\n\t`hidden` integer DEFAULT false NOT NULL,\n\t`updated_at` integer NOT NULL\n);",
      "CREATE TABLE `feeds` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`title` text,\n\t`url` text NOT NULL,\n\t`description` text,\n\t`image` text,\n\t`error_at` text,\n\t`site_url` text,\n\t`owner_user_id` text,\n\t`error_message` text,\n\t`subscription_count` integer,\n\t`updates_per_week` integer,\n\t`latest_entry_published_at` text,\n\t`tip_users` text,\n\t`published_at` integer,\n\t`deleted_at` integer\n);",
      "CREATE TABLE `images` (\n\t`url` text PRIMARY KEY NOT NULL,\n\t`colors` text NOT NULL,\n\t`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL\n);",
      "CREATE TABLE `inboxes` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`title` text,\n\t`secret` text NOT NULL,\n\t`deleted_at` integer\n);",
      "CREATE TABLE `lists` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text,\n\t`title` text NOT NULL,\n\t`feed_ids` text,\n\t`description` text,\n\t`view` integer NOT NULL,\n\t`image` text,\n\t`fee` integer,\n\t`owner_user_id` text,\n\t`subscription_count` integer,\n\t`purchase_amount` text,\n\t`deleted_at` integer\n);",
      "CREATE TABLE `pending_sync_ops` (\n\t`op_id` text PRIMARY KEY NOT NULL,\n\t`op_json` text NOT NULL,\n\t`retry_after` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`status` text DEFAULT 'pending' NOT NULL,\n\t`updated_at` integer,\n\t`applied_at` integer\n);",
      "CREATE TABLE `reading_queue` (\n\t`entry_id` text PRIMARY KEY NOT NULL,\n\t`status` text NOT NULL,\n\t`added_at` integer NOT NULL,\n\t`completed_at` integer,\n\t`updated_at` integer NOT NULL\n);",
      "CREATE INDEX `idx_reading_queue_status_added` ON `reading_queue` (`status`,`added_at`);",
      "CREATE INDEX `idx_reading_queue_completed` ON `reading_queue` (`completed_at`);",
      "CREATE TABLE `subscriptions` (\n\t`feed_id` text,\n\t`list_id` text,\n\t`inbox_id` text,\n\t`user_id` text NOT NULL,\n\t`view` integer NOT NULL,\n\t`is_private` integer NOT NULL,\n\t`hide_from_timeline` integer,\n\t`title` text,\n\t`category` text,\n\t`created_at` text,\n\t`deleted_at` integer,\n\t`type` text NOT NULL,\n\t`id` text PRIMARY KEY NOT NULL\n);",
      "CREATE TABLE `summaries` (\n\t`entry_id` text NOT NULL,\n\t`summary` text NOT NULL,\n\t`readability_summary` text,\n\t`created_at` text,\n\t`language` text DEFAULT '' NOT NULL\n);",
      "CREATE UNIQUE INDEX `unq` ON `summaries` (`entry_id`,`language`);",
      "CREATE TABLE `translations` (\n\t`entry_id` text NOT NULL,\n\t`language` text NOT NULL,\n\t`title` text,\n\t`description` text,\n\t`content` text,\n\t`readability_content` text,\n\t`created_at` text NOT NULL\n);",
      "CREATE UNIQUE INDEX `translation-unique-index` ON `translations` (`entry_id`,`language`);",
      "CREATE TABLE `unread` (\n\t`subscription_id` text PRIMARY KEY NOT NULL,\n\t`count` integer NOT NULL\n);",
      "CREATE TABLE `users` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`email` text,\n\t`handle` text,\n\t`name` text,\n\t`image` text,\n\t`is_me` integer,\n\t`email_verified` integer,\n\t`bio` text,\n\t`website` text,\n\t`social_links` text\n);",
    ],
  },
]
