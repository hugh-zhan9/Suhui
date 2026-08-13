CREATE TABLE IF NOT EXISTS content_clusters (
  id text PRIMARY KEY,
  manual_representative_entry_id text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS content_cluster_members (
  entry_id text PRIMARY KEY,
  cluster_id text NOT NULL,
  fingerprint text NOT NULL,
  basis text NOT NULL,
  algorithm_version integer NOT NULL,
  created_at bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_content_cluster_members_cluster ON content_cluster_members(cluster_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_content_cluster_members_fingerprint ON content_cluster_members(fingerprint);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS content_cluster_exclusions (
  entry_id text PRIMARY KEY,
  fingerprint text NOT NULL,
  created_at bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_content_cluster_exclusions_fingerprint ON content_cluster_exclusions(fingerprint);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS entry_rules (
  id text PRIMARY KEY,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  feed_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  title_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_entry_rules_enabled_updated ON entry_rules(enabled, updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS entry_rule_applications (
  rule_id text NOT NULL,
  entry_id text NOT NULL,
  rule_version integer NOT NULL,
  applied_at bigint NOT NULL,
  PRIMARY KEY (rule_id, entry_id, rule_version)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_entry_rule_applications_entry ON entry_rule_applications(entry_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS entry_user_state (
  entry_id text PRIMARY KEY,
  hidden boolean NOT NULL DEFAULT false,
  updated_at bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id text NOT NULL,
  tag text NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY (entry_id, tag)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS entry_notes (
  id text PRIMARY KEY,
  entry_id text NOT NULL,
  content text NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_entry_notes_entry_updated ON entry_notes(entry_id, updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS entry_highlights (
  id text PRIMARY KEY,
  entry_id text NOT NULL,
  source text NOT NULL,
  quote text NOT NULL,
  prefix text NOT NULL DEFAULT '',
  suffix text NOT NULL DEFAULT '',
  start_offset integer,
  end_offset integer,
  status text NOT NULL DEFAULT 'active',
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  deleted_at bigint
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_entry_highlights_entry_status ON entry_highlights(entry_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reading_queue (
  entry_id text PRIMARY KEY,
  status text NOT NULL,
  added_at bigint NOT NULL,
  completed_at bigint,
  updated_at bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reading_queue_status_added ON reading_queue(status, added_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reading_queue_completed ON reading_queue(completed_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS backup_restore_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  settings jsonb NOT NULL,
  main_applied boolean NOT NULL DEFAULT false,
  renderer_applied boolean NOT NULL DEFAULT false,
  created_at bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS content_cluster_rebuild_state (
  id integer PRIMARY KEY CHECK (id = 1),
  after_entry_id text,
  batch_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  manual_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  processed integer NOT NULL DEFAULT 0,
  clustered integer NOT NULL DEFAULT 0,
  updated_at bigint NOT NULL
);
