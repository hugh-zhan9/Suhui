import type { Database } from "better-sqlite3"
import BDatabase from "better-sqlite3"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres"
import type { PoolConfig } from "pg"
import { Pool } from "pg"

import migrations from "./drizzle/migrations"
import * as schema from "./schemas"

export type MainDb = BetterSQLite3Database<typeof schema> | NodePgDatabase<typeof schema>

export let db: MainDb
let sqlite: Database
let pgPool: Pool

export function initializeMainDB(
  config: { type: "sqlite"; dbPath: string } | { type: "postgres"; config: PoolConfig },
) {
  if (db) return { db, sqlite, pgPool }

  if (config.type === "postgres") {
    pgPool = new Pool(config.config)
    db = drizzlePg(pgPool, { schema })
    return { db, pgPool }
  }

  sqlite = new BDatabase(config.dbPath)
  sqlite.pragma("journal_mode = WAL")

  db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

export function getMainDB() {
  if (!db) throw new Error("Database not initialized")
  return db
}

export function getMainSqlite() {
  if (!sqlite) throw new Error("Database not initialized")
  return sqlite
}

export function getMainPgPool() {
  if (!pgPool) throw new Error("Postgres not initialized")
  return pgPool
}

const migrateSQLite = async () => {
  if (!db || !sqlite) throw new Error("Database not initialized")
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash text NOT NULL,
        created_at numeric
      )
    `)

    const migrationRows = sqlite
      .prepare(
        `SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
      )
      .all() as { id: number; hash: string; created_at: number | string }[]
    const lastMigration = migrationRows[0] ?? undefined

    for (const journalEntry of migrations.journal.entries) {
      if (lastMigration && Number(lastMigration.created_at) >= journalEntry.when) {
        continue
      }

      const query: string =
        (migrations.migrations as Record<string, string>)[
          `m${journalEntry.idx.toString().padStart(4, "0")}`
        ] ?? ""

      if (!query) {
        throw new Error(`Missing migration: ${journalEntry.tag}`)
      }

      const statements = query.split("--> statement-breakpoint")
      for (const rawStmt of statements) {
        const stmt = rawStmt.trim()
        if (!stmt) continue

        const addColMatch = stmt.match(/^ALTER TABLE\s+[`"]?(\w+)[`"]?\s+ADD\s+[`"]?(\w+)[`"]?\s+/i)
        if (addColMatch) {
          const existingCols = (
            sqlite.prepare(`PRAGMA table_info(\`${addColMatch[1]}\`)`).all() as {
              name: string
            }[]
          ).map((c) => c.name)
          if (existingCols.includes(addColMatch[2]!)) continue
        }

        try {
          const upperStmt = stmt.toUpperCase()
          if (
            upperStmt.startsWith("INSERT INTO") &&
            upperStmt.includes("__NEW_") &&
            upperStmt.includes(" SELECT ") &&
            upperStmt.includes(" FROM ")
          ) {
            const selectIndex = upperStmt.indexOf(" SELECT ")
            const fromIndex = upperStmt.indexOf(" FROM ", selectIndex)
            if (selectIndex !== -1 && fromIndex > selectIndex) {
              const colsStr = stmt.slice(selectIndex + 8, fromIndex).trim()
              const sourceChunk = stmt.slice(fromIndex + 6).trim()
              const sourceTable = sourceChunk.match(/^[`"]?(\w+)/)?.[1]
              if (sourceTable) {
                const selectCols = colsStr
                  .split(",")
                  .map((c) => c.trim().replaceAll('"', "").replaceAll("`", ""))
                const tableInfoRows = sqlite
                  .prepare(`PRAGMA table_info(\`${sourceTable}\`)`)
                  .all() as { name: string }[]
                if (
                  tableInfoRows.length === 0 ||
                  selectCols.some((c) => !tableInfoRows.find((r) => r.name === c))
                ) {
                  console.warn(
                    `[Migration] Skipping INSERT...SELECT for ${sourceTable}: table/columns missing (fresh or partially migrated DB, no data to copy)`,
                  )
                  continue
                }
              }
            }
          }

          sqlite.exec(stmt)
        } catch (e: any) {
          const msg: string = e.message ?? ""
          if (
            msg.includes("already exists") ||
            msg.includes("UNIQUE constraint failed") ||
            msg.includes("no such table") ||
            msg.includes("no such column") ||
            msg.includes("duplicate column name")
          ) {
            console.warn(
              `[Migration] Skipping statement (tolerated error: ${msg.split("\n")[0]}): ${stmt.slice(0, 80)}...`,
            )
            continue
          }
          throw e
        }
      }

      sqlite
        .prepare(`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES(?, ?)`)
        .run(journalEntry.tag, journalEntry.when)
    }

    console.info("[DBManager] DB migrations completed successfully")
  } catch (error) {
    console.error("Failed to migrate main database:", error)
    throw error
  }
}

export async function migrateMainDB(dbType: "sqlite" | "postgres") {
  if (!db) throw new Error("Database not initialized")

  if (dbType === "postgres") {
    if (!pgPool) throw new Error("Postgres not initialized")
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
        `published_at bigint\n` +
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
        `type text not null,\n` +
        `id text primary key\n` +
        `);`,
      `CREATE TABLE IF NOT EXISTS inboxes (id text primary key, title text, secret text not null);`,
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
        `purchase_amount text\n` +
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
        `settings jsonb\n` +
        `);`,
      `CREATE TABLE IF NOT EXISTS collections (\n` +
        `feed_id text,\n` +
        `entry_id text primary key,\n` +
        `created_at text,\n` +
        `view integer not null\n` +
        `);`,
      `CREATE TABLE IF NOT EXISTS summaries (\n` +
        `entry_id text not null,\n` +
        `summary text not null,\n` +
        `readability_summary text,\n` +
        `created_at text,\n` +
        `language text\n` +
        `);`,
      `CREATE UNIQUE INDEX IF NOT EXISTS unq ON summaries(entry_id, language);`,
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
    ]

    for (const stmt of statements) {
      await pgPool.query(stmt)
    }
    return
  }

  if (!sqlite) throw new Error("Database not initialized")
  await migrateSQLite()
}
