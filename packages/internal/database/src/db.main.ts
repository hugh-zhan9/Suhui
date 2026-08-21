import { createRequire } from "node:module"

import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres"
import type { PoolClient, PoolConfig } from "pg"
import { Pool } from "pg"

import { sqliteMigrations } from "./drizzle/sqlite-baseline"
import * as schema from "./schemas"
import * as sqliteSchema from "./schemas/sqlite"

export type MainDb = NodePgDatabase<typeof schema>

export type SqliteFileConfig = { filePath: string }

/** better-sqlite3 的最小接口，避免在类型层引入原生模块 */
type SqliteDatabase = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    all: (...params: unknown[]) => unknown[]
    run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint }
  }
  close: () => void
  pragma: (source: string) => unknown
}

export type MainDbHandles =
  | { type: "postgres"; config: PoolConfig; db: MainDb; pgPool: Pool }
  | { type: "sqlite"; config: SqliteFileConfig; db: MainDb; sqlite: SqliteDatabase }

export let db: MainDb
let activeHandles: MainDbHandles | null = null

const nodeRequire = createRequire(import.meta.url)

/**
 * 原生模块惰性加载：better-sqlite3 的二进制按 Electron ABI 编译，只在主进程可用。
 *
 * 注意只有**原生模块本身**需要惰性 require。drizzle 的 sqlite 驱动是纯 JS，必须静态
 * 导入让打包器把它打进 bundle——打包后的 app.asar 里没有 node_modules/drizzle-orm，
 * 运行期 `require("drizzle-orm/better-sqlite3")` 会以
 * `Cannot find module` 失败（转换到 SQLite 时踩过）。驱动内部对 better-sqlite3 的
 * import 由 electron.vite.config 的 `external` 保留成运行期 require。
 */
const openSqlite = (filePath: string): SqliteDatabase => {
  const Database = nodeRequire("better-sqlite3") as new (path: string) => SqliteDatabase
  const sqlite = new Database(filePath)
  // 外键级联在 SQLite 需要按连接开启，否则 onDelete: "cascade" 静默失效
  sqlite.pragma("foreign_keys = ON")
  sqlite.pragma("journal_mode = WAL")
  return sqlite
}

export function createMainDBHandles(
  input: { type: "postgres"; config: PoolConfig } | { type: "sqlite"; config: SqliteFileConfig },
): MainDbHandles {
  if (input.type === "sqlite") {
    const sqlite = openSqlite(input.config.filePath)
    return {
      type: "sqlite",
      config: input.config,
      // 两个方言的 schema 逐列产出相同的 JS 类型（见 plan 的 D6 与
      // dialect-type-parity.test-d.ts），故此处的收窄是安全的。
      db: drizzleSqlite(sqlite as never, { schema: sqliteSchema }) as unknown as MainDb,
      sqlite,
    }
  }

  const nextPool = new Pool(input.config)
  nextPool.on("error", (error: Error, client: PoolClient) => {
    console.warn("[DB] Postgres pool idle client error", {
      error: error.message,
      processID: (client as PoolClient & { processID?: number }).processID,
    })
  })
  return {
    type: "postgres",
    config: input.config,
    db: drizzlePg(nextPool, { schema }),
    pgPool: nextPool,
  }
}

export function activateMainDB(handles: MainDbHandles) {
  activeHandles = handles
  db = handles.db
  return handles
}

export function getActiveMainDBHandles() {
  return activeHandles
}

export async function closeMainDBHandles(handles: MainDbHandles) {
  if (handles.type === "sqlite") {
    handles.sqlite.close()
    return
  }
  await handles.pgPool.end()
}

export function initializeMainDB(
  config: { type: "postgres"; config: PoolConfig } | { type: "sqlite"; config: SqliteFileConfig },
) {
  if (activeHandles) return activeHandles
  return activateMainDB(createMainDBHandles(config))
}

export function getMainDB() {
  if (!db) throw new Error("Database not initialized")
  return db
}

export type RawSqlMethod = "run" | "all" | "get" | "values"
export type RawSqlResult = { rows: unknown[][]; rowsAffected: number }

/**
 * 方言无关的裸 SQL 执行。统一返回**数组行**，把 pg 的 `fields`/`rowCount` 与
 * better-sqlite3 的 `{changes,lastInsertRowid}` 差异收敛在这里，调用方不再感知方言。
 */
export async function executeMainRawSql(
  sql: string,
  params: unknown[] = [],
  method: RawSqlMethod = "all",
): Promise<RawSqlResult> {
  if (!activeHandles) throw new Error("Database not initialized")

  if (activeHandles.type === "sqlite") {
    const statement = activeHandles.sqlite.prepare(sql)
    if (method === "run") {
      const info = statement.run(...params)
      return { rows: [], rowsAffected: Number(info.changes ?? 0) }
    }
    const rows = statement.all(...params) as Record<string, unknown>[]
    return { rows: rows.map((row) => Object.values(row)), rowsAffected: rows.length }
  }

  const result = await activeHandles.pgPool.query(sql, params as unknown[])
  const fieldNames = (result.fields ?? []).map((field) => field.name)
  const rows = (result.rows ?? []).map((row: Record<string, unknown>) =>
    fieldNames.length > 0 ? fieldNames.map((name) => row[name]) : Object.values(row),
  )
  return { rows, rowsAffected: result.rowCount ?? 0 }
}

/**
 * 方言无关的事务。drizzle 的 better-sqlite3 驱动是同步的，`db.transaction`
 * 只接受同步回调，因此 sqlite 侧改用显式 BEGIN/COMMIT 以容纳异步业务代码。
 */
export async function runInMainTransaction<T>(fn: (tx: MainDb) => Promise<T> | T): Promise<T> {
  if (!activeHandles) throw new Error("Database not initialized")

  if (activeHandles.type === "sqlite") {
    const { sqlite } = activeHandles
    sqlite.exec("BEGIN")
    try {
      const result = await fn(activeHandles.db)
      sqlite.exec("COMMIT")
      return result
    } catch (error) {
      try {
        sqlite.exec("ROLLBACK")
      } catch (rollbackError) {
        console.warn("[DB] sqlite rollback failed", {
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        })
      }
      throw error
    }
  }

  return activeHandles.db.transaction(async (tx) => fn(tx as unknown as MainDb))
}

export function getMainDialect() {
  if (!activeHandles) throw new Error("Database not initialized")
  return activeHandles.type
}

export function getMainPgPool() {
  if (!activeHandles) throw new Error("Database not initialized")
  if (activeHandles.type !== "postgres") {
    throw new Error(`getMainPgPool is postgres-only, active dialect is ${activeHandles.type}`)
  }
  return activeHandles.pgPool
}

export function getMainSqlite() {
  if (!activeHandles) throw new Error("Database not initialized")
  if (activeHandles.type !== "sqlite") {
    throw new Error(`getMainSqlite is sqlite-only, active dialect is ${activeHandles.type}`)
  }
  return activeHandles.sqlite
}

/** SQLite 侧的迁移账本。drizzle-kit 生成的是裸 CREATE TABLE，需要账本保证幂等。 */
const sqliteMigrationLedger = "__suhui_migrations"

const migrateMainSqliteDB = (sqlite: SqliteDatabase) => {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS ${sqliteMigrationLedger} (tag text primary key, applied_at integer not null)`,
  )

  const applied = new Set(
    (sqlite.prepare(`select tag from ${sqliteMigrationLedger}`).all() as { tag: string }[]).map(
      (row) => row.tag,
    ),
  )

  for (const migration of sqliteMigrations) {
    if (applied.has(migration.tag)) continue
    for (const statement of migration.statements) {
      sqlite.exec(statement)
    }
    sqlite
      .prepare(`insert into ${sqliteMigrationLedger} (tag, applied_at) values (?, ?)`)
      .run(migration.tag, Date.now())
  }
}

export async function migrateMainDB(handles = activeHandles) {
  if (!handles) throw new Error("Database not initialized")
  if (handles.type === "sqlite") {
    migrateMainSqliteDB(handles.sqlite)
    return
  }
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
