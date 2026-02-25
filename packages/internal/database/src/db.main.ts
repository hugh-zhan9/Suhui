import type { Database } from "better-sqlite3"
import BDatabase from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"

import migrations from "./drizzle/migrations"
import { migrate } from "./migrator"
import * as schema from "./schemas"

export let db: BetterSQLite3Database<typeof schema>
let sqlite: Database

export function initializeMainDB(dbPath: string) {
  if (db) return { db, sqlite };
  
  sqlite = new BDatabase(dbPath)
  // Enable WAL mode for better performance
  sqlite.pragma('journal_mode = WAL')
  
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

export async function migrateMainDB() {
  if (!db || !sqlite) throw new Error("Database not initialized")
  try {
    // Ensure migrations tracking table exists
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash text NOT NULL,
        created_at numeric
      )
    `)

    const migrationRows = sqlite
      .prepare(`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`)
      .all() as { id: number; hash: string; created_at: number | string }[]
    const lastMigration = migrationRows[0] ?? undefined

    // Process each migration file individually
    for (const journalEntry of migrations.journal.entries) {
      if (
        lastMigration &&
        Number(lastMigration.created_at) >= journalEntry.when
      ) {
        continue // already applied
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

        // Skip ADD COLUMN if column already exists (idempotent)
        const addColMatch = stmt.match(
          /^ALTER TABLE\s+[`"]?(\w+)[`"]?\s+ADD\s+[`"]?(\w+)[`"]?\s+/i,
        )
        if (addColMatch) {
          const existingCols = (
            sqlite.prepare(`PRAGMA table_info(\`${addColMatch[1]}\`)`).all() as {
              name: string
            }[]
          ).map((c) => c.name)
          if (existingCols.includes(addColMatch[2]!)) continue
        }

        try {
          // Before executing INSERT...SELECT that restructures a table, verify the
          // source table has the expected columns. On a fresh DB, old tables may
          // lack columns that only exist after intermediate migrations, so we skip
          // the data-migration INSERT (there's no data to copy anyway).
          const insertSelectMatch = stmt.match(
            /^INSERT INTO\s+[`"]?__new_(\w+)[`"]?\s*\(([^)]+)\)\s+SELECT\s+([^)]+)\s+FROM\s+[`"]?(\w+)[`"]?/i,
          )
          if (insertSelectMatch) {
            const sourceTable = insertSelectMatch[4]!
            const colsStr = insertSelectMatch[3]!
            const selectCols = colsStr
              .split(",")
              .map((c) => c.trim().replaceAll('"', "").replaceAll("`", ""))
            const tableInfoRows = sqlite
              .prepare(`PRAGMA table_info(\`${sourceTable}\`)`)
              .all() as { name: string }[]
            if (tableInfoRows.length === 0 || selectCols.some((c) => !tableInfoRows.find((r) => r.name === c))) {
              console.warn(
                `[Migration] Skipping INSERT...SELECT for ${sourceTable}: table/columns missing (fresh or partially migrated DB, no data to copy)`,
              )
              continue
            }
          }

          sqlite.exec(stmt)
        } catch (e: any) {
          const msg: string = e.message ?? ""
          // Tolerate statements that are already applied or referencing state
          // that differs from the "clean upgrade" path (e.g., after a crash
          // mid-migration, or on a fresh DB running historical migrations)
          if (
            msg.includes("already exists") ||
            msg.includes("UNIQUE constraint failed") ||
            msg.includes("no such table") ||
            msg.includes("no such column") ||
            msg.includes("duplicate column name")
          ) {
            console.warn(`[Migration] Skipping statement (tolerated error: ${msg.split("\n")[0]}): ${stmt.slice(0, 80)}...`)
            continue
          }
          throw e
        }
      }

      // Record migration as applied
      sqlite
        .prepare(
          `INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES(?, ?)`,
        )
        .run(journalEntry.tag, journalEntry.when)
    }

    console.log("[DBManager] DB migrations completed successfully")
  } catch (error) {
    console.error("Failed to migrate main database:", error)
    throw error
  }
}
