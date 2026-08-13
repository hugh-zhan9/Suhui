import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres"
import type { PoolClient, PoolConfig } from "pg"
import { Pool } from "pg"

import * as schema from "./schemas"

export type MainDb = NodePgDatabase<typeof schema>
export type MainDbHandles = {
  config: PoolConfig
  db: MainDb
  pgPool: Pool
  type: "postgres"
}

export let db: MainDb
let pgPool: Pool
let activeHandles: MainDbHandles | null = null

export function createMainDBHandles(config: {
  type: "postgres"
  config: PoolConfig
}): MainDbHandles {
  const nextPool = new Pool(config.config)
  nextPool.on("error", (error: Error, client: PoolClient) => {
    console.warn("[DB] Postgres pool idle client error", {
      error: error.message,
      processID: (client as PoolClient & { processID?: number }).processID,
    })
  })
  const nextDb = drizzlePg(nextPool, { schema })
  return {
    type: "postgres",
    config: config.config,
    db: nextDb,
    pgPool: nextPool,
  }
}

export function activateMainDB(handles: MainDbHandles) {
  activeHandles = handles
  db = handles.db
  pgPool = handles.pgPool
  return handles
}

export function getActiveMainDBHandles() {
  return activeHandles
}

export async function closeMainDBHandles(handles: MainDbHandles) {
  await handles.pgPool.end()
}

export function initializeMainDB(config: { type: "postgres"; config: PoolConfig }) {
  if (activeHandles) return activeHandles
  return activateMainDB(createMainDBHandles(config))
}

export function getMainDB() {
  if (!db) throw new Error("Database not initialized")
  return db
}

export function getMainPgPool() {
  if (!pgPool) throw new Error("Postgres not initialized")
  return pgPool
}

export async function migrateMainDB(handles = activeHandles) {
  if (!handles) throw new Error("Database not initialized")
  const pool = handles.pgPool
  const statements = [
    `CREATE TABLE IF NOT EXISTS feeds (\n` +
      `id text primary key,\n` +
      `title text,\n` +
      `url text not null,\n` +
      `description text,\n` +
      `image text,\n` +
      `error_at text,\n` +
      `site_url text,\n` +
      `owner_user_id text,\n` +
      `error_message text,\n` +
      `subscription_count integer,\n` +
      `updates_per_week integer,\n` +
      `latest_entry_published_at text,\n` +
      `tip_users jsonb,\n` +
      `published_at bigint,\n` +
      `deleted_at bigint\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS subscriptions (\n` +
      `feed_id text,\n` +
      `list_id text,\n` +
      `inbox_id text,\n` +
      `user_id text not null,\n` +
      `view integer not null,\n` +
      `is_private boolean not null,\n` +
      `hide_from_timeline boolean,\n` +
      `title text,\n` +
      `category text,\n` +
      `created_at text,\n` +
      `deleted_at bigint,\n` +
      `type text not null,\n` +
      `id text primary key\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS inboxes (id text primary key, title text, secret text not null, deleted_at bigint);`,
    `CREATE TABLE IF NOT EXISTS lists (\n` +
      `id text primary key,\n` +
      `user_id text,\n` +
      `title text not null,\n` +
      `feed_ids jsonb,\n` +
      `description text,\n` +
      `view integer not null,\n` +
      `image text,\n` +
      `fee integer,\n` +
      `owner_user_id text,\n` +
      `subscription_count integer,\n` +
      `purchase_amount text,\n` +
      `deleted_at bigint\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS unread (subscription_id text primary key, count integer not null);`,
    `CREATE TABLE IF NOT EXISTS users (\n` +
      `id text primary key,\n` +
      `email text,\n` +
      `handle text,\n` +
      `name text,\n` +
      `image text,\n` +
      `is_me boolean,\n` +
      `email_verified boolean,\n` +
      `bio text,\n` +
      `website text,\n` +
      `social_links jsonb\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS entries (\n` +
      `id text primary key,\n` +
      `title text,\n` +
      `url text,\n` +
      `content text,\n` +
      `source_content text,\n` +
      `readability_updated_at bigint,\n` +
      `description text,\n` +
      `guid text not null,\n` +
      `author text,\n` +
      `author_url text,\n` +
      `author_avatar text,\n` +
      `inserted_at bigint not null,\n` +
      `published_at bigint not null,\n` +
      `media jsonb,\n` +
      `categories jsonb,\n` +
      `attachments jsonb,\n` +
      `extra jsonb,\n` +
      `language text,\n` +
      `feed_id text,\n` +
      `inbox_handle text,\n` +
      `read boolean,\n` +
      `sources jsonb,\n` +
      `settings jsonb,\n` +
      `deleted_at bigint\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS collections (\n` +
      `feed_id text,\n` +
      `entry_id text primary key,\n` +
      `created_at text,\n` +
      `view integer not null,\n` +
      `deleted_at bigint\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS summaries (\n` +
      `entry_id text not null,\n` +
      `summary text not null,\n` +
      `readability_summary text,\n` +
      `created_at text,\n` +
      `language text\n` +
      `);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS unq ON summaries(entry_id, language);`,
    `DELETE FROM summaries a USING summaries b WHERE a.ctid < b.ctid AND a.entry_id = b.entry_id AND COALESCE(a.language, '') = COALESCE(b.language, '');`,
    `UPDATE summaries SET language = '' WHERE language IS NULL;`,
    `ALTER TABLE summaries ALTER COLUMN language SET DEFAULT '';`,
    `ALTER TABLE summaries ALTER COLUMN language SET NOT NULL;`,
    `CREATE TABLE IF NOT EXISTS translations (\n` +
      `entry_id text not null,\n` +
      `language text not null,\n` +
      `title text,\n` +
      `description text,\n` +
      `content text,\n` +
      `readability_content text,\n` +
      `created_at text not null\n` +
      `);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "translation-unique-index" ON translations(entry_id, language);`,
    `CREATE TABLE IF NOT EXISTS images (\n` +
      `url text primary key,\n` +
      `colors jsonb not null,\n` +
      `created_at bigint not null default (extract(epoch from now()) * 1000)::bigint\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS ai_chat_sessions (\n` +
      `id text primary key,\n` +
      `title text,\n` +
      `created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,\n` +
      `updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,\n` +
      `is_local boolean not null default false\n` +
      `);`,
    `CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_updated_at ON ai_chat_sessions(updated_at);`,
    `CREATE TABLE IF NOT EXISTS ai_chat_messages (\n` +
      `id text primary key,\n` +
      `chat_id text not null references ai_chat_sessions(id) on delete cascade,\n` +
      `role text not null,\n` +
      `created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,\n` +
      `metadata jsonb,\n` +
      `status text default 'completed',\n` +
      `finished_at bigint,\n` +
      `message_parts jsonb\n` +
      `);`,
    `CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_chat_id_created_at ON ai_chat_messages(chat_id, created_at);`,
    `CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_status ON ai_chat_messages(status);`,
    `CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_chat_id_role ON ai_chat_messages(chat_id, role);`,
    `CREATE TABLE IF NOT EXISTS applied_sync_ops (op_id text primary key, applied_at bigint not null);`,
    `CREATE TABLE IF NOT EXISTS pending_sync_ops (\n` +
      `op_id text primary key,\n` +
      `op_json text not null,\n` +
      `retry_after bigint not null default 0,\n` +
      `created_at bigint not null,\n` +
      `status text not null default 'pending',\n` +
      `updated_at bigint,\n` +
      `applied_at bigint\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS content_clusters (\n` +
      `id text primary key,\n` +
      `manual_representative_entry_id text,\n` +
      `created_at bigint not null,\n` +
      `updated_at bigint not null\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS content_cluster_members (\n` +
      `entry_id text primary key,\n` +
      `cluster_id text not null,\n` +
      `fingerprint text not null,\n` +
      `basis text not null,\n` +
      `algorithm_version integer not null,\n` +
      `created_at bigint not null\n` +
      `);`,
    `CREATE INDEX IF NOT EXISTS idx_content_cluster_members_cluster ON content_cluster_members(cluster_id);`,
    `CREATE INDEX IF NOT EXISTS idx_content_cluster_members_fingerprint ON content_cluster_members(fingerprint);`,
    `CREATE TABLE IF NOT EXISTS content_cluster_exclusions (\n` +
      `entry_id text primary key,\n` +
      `fingerprint text not null,\n` +
      `created_at bigint not null\n` +
      `);`,
    `CREATE INDEX IF NOT EXISTS idx_content_cluster_exclusions_fingerprint ON content_cluster_exclusions(fingerprint);`,
    `CREATE TABLE IF NOT EXISTS entry_rules (\n` +
      `id text primary key,\n` +
      `name text not null,\n` +
      `enabled boolean not null default true,\n` +
      `feed_ids jsonb not null default '[]'::jsonb,\n` +
      `title_keywords jsonb not null default '[]'::jsonb,\n` +
      `actions jsonb not null,\n` +
      `version integer not null default 1,\n` +
      `created_at bigint not null,\n` +
      `updated_at bigint not null,\n` +
      `deleted_at bigint\n` +
      `);`,
    `CREATE INDEX IF NOT EXISTS idx_entry_rules_enabled_updated ON entry_rules(enabled, updated_at);`,
    `CREATE TABLE IF NOT EXISTS entry_rule_applications (\n` +
      `rule_id text not null,\n` +
      `entry_id text not null,\n` +
      `rule_version integer not null,\n` +
      `applied_at bigint not null,\n` +
      `primary key (rule_id, entry_id, rule_version)\n` +
      `);`,
    `CREATE INDEX IF NOT EXISTS idx_entry_rule_applications_entry ON entry_rule_applications(entry_id);`,
    `CREATE TABLE IF NOT EXISTS entry_user_state (\n` +
      `entry_id text primary key,\n` +
      `hidden boolean not null default false,\n` +
      `updated_at bigint not null\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS entry_tags (\n` +
      `entry_id text not null,\n` +
      `tag text not null,\n` +
      `created_at bigint not null,\n` +
      `primary key (entry_id, tag)\n` +
      `);`,
    `CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag);`,
    `CREATE TABLE IF NOT EXISTS entry_notes (\n` +
      `id text primary key,\n` +
      `entry_id text not null,\n` +
      `content text not null,\n` +
      `created_at bigint not null,\n` +
      `updated_at bigint not null,\n` +
      `deleted_at bigint\n` +
      `);`,
    `CREATE INDEX IF NOT EXISTS idx_entry_notes_entry_updated ON entry_notes(entry_id, updated_at);`,
    `CREATE TABLE IF NOT EXISTS entry_highlights (\n` +
      `id text primary key,\n` +
      `entry_id text not null,\n` +
      `source text not null,\n` +
      `quote text not null,\n` +
      `prefix text not null default '',\n` +
      `suffix text not null default '',\n` +
      `start_offset integer,\n` +
      `end_offset integer,\n` +
      `status text not null default 'active',\n` +
      `created_at bigint not null,\n` +
      `updated_at bigint not null,\n` +
      `deleted_at bigint\n` +
      `);`,
    `CREATE INDEX IF NOT EXISTS idx_entry_highlights_entry_status ON entry_highlights(entry_id, status);`,
    `CREATE TABLE IF NOT EXISTS reading_queue (\n` +
      `entry_id text primary key,\n` +
      `status text not null,\n` +
      `added_at bigint not null,\n` +
      `completed_at bigint,\n` +
      `updated_at bigint not null\n` +
      `);`,
    `CREATE INDEX IF NOT EXISTS idx_reading_queue_status_added ON reading_queue(status, added_at);`,
    `CREATE INDEX IF NOT EXISTS idx_reading_queue_completed ON reading_queue(completed_at);`,
    `CREATE TABLE IF NOT EXISTS backup_restore_settings (\n` +
      `id integer primary key check (id = 1),\n` +
      `settings jsonb not null,\n` +
      `main_applied boolean not null default false,\n` +
      `renderer_applied boolean not null default false,\n` +
      `created_at bigint not null\n` +
      `);`,
    `CREATE TABLE IF NOT EXISTS content_cluster_rebuild_state (\n` +
      `id integer primary key check (id = 1),\n` +
      `after_entry_id text,\n` +
      `batch_entry_ids jsonb not null default '[]'::jsonb,\n` +
      `manual_entry_ids jsonb not null default '[]'::jsonb,\n` +
      `processed integer not null default 0,\n` +
      `clustered integer not null default 0,\n` +
      `updated_at bigint not null\n` +
      `);`,
    `ALTER TABLE content_cluster_rebuild_state ADD COLUMN IF NOT EXISTS batch_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb;`,
    `ALTER TABLE content_cluster_rebuild_state ADD COLUMN IF NOT EXISTS manual_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb;`,
    `ALTER TABLE feeds ADD COLUMN IF NOT EXISTS deleted_at bigint;`,
    `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS deleted_at bigint;`,
    `ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS deleted_at bigint;`,
    `ALTER TABLE lists ADD COLUMN IF NOT EXISTS deleted_at bigint;`,
    `ALTER TABLE entries ADD COLUMN IF NOT EXISTS deleted_at bigint;`,
    `ALTER TABLE collections ADD COLUMN IF NOT EXISTS deleted_at bigint;`,
  ]

  for (const stmt of statements) {
    await pool.query(stmt)
  }
}
