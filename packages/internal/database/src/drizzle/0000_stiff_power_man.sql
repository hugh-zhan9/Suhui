CREATE TABLE `ai_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`metadata` text,
	`status` text DEFAULT 'completed',
	`finished_at` integer,
	`message_parts` text,
	FOREIGN KEY (`chat_id`) REFERENCES `ai_chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ai_chat_messages_chat_id_created_at` ON `ai_chat_messages` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_chat_messages_status` ON `ai_chat_messages` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ai_chat_messages_chat_id_role` ON `ai_chat_messages` (`chat_id`,`role`);--> statement-breakpoint
CREATE TABLE `ai_chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`is_local` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_chat_sessions_updated_at` ON `ai_chat_sessions` (`updated_at`);--> statement-breakpoint
CREATE TABLE `applied_sync_ops` (
	`op_id` text PRIMARY KEY NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_restore_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	`main_applied` integer DEFAULT false NOT NULL,
	`renderer_applied` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`feed_id` text,
	`entry_id` text PRIMARY KEY NOT NULL,
	`created_at` text,
	`view` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `content_cluster_exclusions` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_cluster_exclusions_fingerprint` ON `content_cluster_exclusions` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `content_cluster_members` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`cluster_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`basis` text NOT NULL,
	`algorithm_version` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_cluster_members_cluster` ON `content_cluster_members` (`cluster_id`);--> statement-breakpoint
CREATE INDEX `idx_content_cluster_members_fingerprint` ON `content_cluster_members` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `content_cluster_rebuild_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`after_entry_id` text,
	`batch_entry_ids` text DEFAULT '[]' NOT NULL,
	`manual_entry_ids` text DEFAULT '[]' NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`clustered` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`manual_representative_entry_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`url` text,
	`content` text,
	`source_content` text,
	`readability_updated_at` integer,
	`description` text,
	`guid` text NOT NULL,
	`author` text,
	`author_url` text,
	`author_avatar` text,
	`inserted_at` integer NOT NULL,
	`published_at` integer NOT NULL,
	`media` text,
	`categories` text,
	`attachments` text,
	`extra` text,
	`language` text,
	`feed_id` text,
	`inbox_handle` text,
	`read` integer,
	`sources` text,
	`settings` text,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `entry_highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`source` text NOT NULL,
	`quote` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`suffix` text DEFAULT '' NOT NULL,
	`start_offset` integer,
	`end_offset` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_entry_highlights_entry_status` ON `entry_highlights` (`entry_id`,`status`);--> statement-breakpoint
CREATE TABLE `entry_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_entry_notes_entry_updated` ON `entry_notes` (`entry_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `entry_rule_applications` (
	`rule_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`rule_version` integer NOT NULL,
	`applied_at` integer NOT NULL,
	PRIMARY KEY(`rule_id`, `entry_id`, `rule_version`)
);
--> statement-breakpoint
CREATE INDEX `idx_entry_rule_applications_entry` ON `entry_rule_applications` (`entry_id`);--> statement-breakpoint
CREATE TABLE `entry_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`feed_ids` text DEFAULT '[]' NOT NULL,
	`title_keywords` text DEFAULT '[]' NOT NULL,
	`actions` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_entry_rules_enabled_updated` ON `entry_rules` (`enabled`,`updated_at`);--> statement-breakpoint
CREATE TABLE `entry_tags` (
	`entry_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `tag`)
);
--> statement-breakpoint
CREATE INDEX `idx_entry_tags_tag` ON `entry_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `entry_user_state` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`url` text NOT NULL,
	`description` text,
	`image` text,
	`error_at` text,
	`site_url` text,
	`owner_user_id` text,
	`error_message` text,
	`subscription_count` integer,
	`updates_per_week` integer,
	`latest_entry_published_at` text,
	`tip_users` text,
	`published_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `images` (
	`url` text PRIMARY KEY NOT NULL,
	`colors` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`secret` text NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`title` text NOT NULL,
	`feed_ids` text,
	`description` text,
	`view` integer NOT NULL,
	`image` text,
	`fee` integer,
	`owner_user_id` text,
	`subscription_count` integer,
	`purchase_amount` text,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `pending_sync_ops` (
	`op_id` text PRIMARY KEY NOT NULL,
	`op_json` text NOT NULL,
	`retry_after` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`updated_at` integer,
	`applied_at` integer
);
--> statement-breakpoint
CREATE TABLE `reading_queue` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`added_at` integer NOT NULL,
	`completed_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reading_queue_status_added` ON `reading_queue` (`status`,`added_at`);--> statement-breakpoint
CREATE INDEX `idx_reading_queue_completed` ON `reading_queue` (`completed_at`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`feed_id` text,
	`list_id` text,
	`inbox_id` text,
	`user_id` text NOT NULL,
	`view` integer NOT NULL,
	`is_private` integer NOT NULL,
	`hide_from_timeline` integer,
	`title` text,
	`category` text,
	`created_at` text,
	`deleted_at` integer,
	`type` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `summaries` (
	`entry_id` text NOT NULL,
	`summary` text NOT NULL,
	`readability_summary` text,
	`created_at` text,
	`language` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unq` ON `summaries` (`entry_id`,`language`);--> statement-breakpoint
CREATE TABLE `translations` (
	`entry_id` text NOT NULL,
	`language` text NOT NULL,
	`title` text,
	`description` text,
	`content` text,
	`readability_content` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `translation-unique-index` ON `translations` (`entry_id`,`language`);--> statement-breakpoint
CREATE TABLE `unread` (
	`subscription_id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`handle` text,
	`name` text,
	`image` text,
	`is_me` integer,
	`email_verified` integer,
	`bio` text,
	`website` text,
	`social_links` text
);
