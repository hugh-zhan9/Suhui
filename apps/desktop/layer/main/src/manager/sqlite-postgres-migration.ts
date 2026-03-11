import fs from "node:fs"

import BDatabase from "better-sqlite3"
import type { Pool } from "pg"

const tablesToCheck = ["feeds", "subscriptions", "entries"]

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true"
  return null
}

const toPgJson = (value: unknown) => {
  if (value === null || value === undefined) return null
  if (typeof value === "string") {
    if (!value) return null
    try {
      JSON.parse(value)
      return value
    } catch {
      return null
    }
  }
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export const isPostgresEmpty = async (pool: Pool) => {
  for (const table of tablesToCheck) {
    const result = await pool.query(`SELECT COUNT(*)::text AS count FROM ${table}`)
    const count = Number(result.rows?.[0]?.count ?? 0)
    if (count > 0) return false
  }
  return true
}

type SqliteReader = {
  prepare: (sql: string) => { get?: (param?: unknown) => unknown; all?: () => unknown[] }
  close: () => void
}

export const hasSqliteData = (
  dbPath: string,
  sqliteFactory: (path: string) => SqliteReader = (path) =>
    new BDatabase(path, { readonly: true }) as unknown as SqliteReader,
) => {
  if (!fs.existsSync(dbPath)) return false
  const sqlite = sqliteFactory(dbPath)
  try {
    const exists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'")
      .get()
    if (!exists) return false
    const row = sqlite.prepare("SELECT COUNT(*) as count FROM entries").get() as { count: number }
    return Number(row?.count ?? 0) > 0
  } finally {
    sqlite.close()
  }
}

const insertRows = async (pool: Pool, table: string, rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return
  const columns = Object.keys(rows[0]!)
  const values: unknown[] = []
  const placeholders = rows
    .map((row, rowIndex) => {
      const start = rowIndex * columns.length
      columns.forEach((col) => values.push(row[col]))
      const marks = columns.map((_, i) => `$${start + i + 1}`)
      return `(${marks.join(", ")})`
    })
    .join(", ")
  const columnList = columns.map((c) => `"${c}"`).join(", ")
  const sql = `INSERT INTO "${table}" (${columnList}) VALUES ${placeholders}`
  await pool.query(sql, values)
}

const tableExists = (sqlite: SqliteReader, table: string) => {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get?.(table)
  return !!row
}

const fetchRows = (sqlite: SqliteReader, table: string) =>
  (sqlite.prepare(`SELECT * FROM ${table}`).all?.() ?? []) as Record<string, unknown>[]

const mapRow = (table: string, row: Record<string, unknown>) => {
  const mapped = { ...row }
  if (table === "subscriptions") {
    mapped.is_private = toBoolean(row.is_private)
    mapped.hide_from_timeline = toBoolean(row.hide_from_timeline)
  }
  if (table === "entries") {
    mapped.read = toBoolean(row.read)
    mapped.media = toPgJson(row.media)
    mapped.categories = toPgJson(row.categories)
    mapped.attachments = toPgJson(row.attachments)
    mapped.extra = toPgJson(row.extra)
    mapped.sources = toPgJson(row.sources)
    mapped.settings = toPgJson(row.settings)
  }
  if (table === "feeds") {
    mapped.tip_users = toPgJson(row.tip_users)
  }
  if (table === "users") {
    mapped.is_me = toBoolean(row.is_me)
    mapped.email_verified = toBoolean(row.email_verified)
    mapped.social_links = toPgJson(row.social_links)
  }
  if (table === "lists") {
    mapped.feed_ids = toPgJson(row.feed_ids)
  }
  if (table === "collections") {
    mapped.view = row.view
  }
  if (table === "summaries") {
    mapped.language = row.language
  }
  if (table === "translations") {
    mapped.language = row.language
  }
  if (table === "images") {
    mapped.colors = toPgJson(row.colors)
  }
  if (table === "ai_chat_messages") {
    mapped.metadata = toPgJson(row.metadata)
    mapped.message_parts = toPgJson(row.message_parts)
  }
  if (table === "unread") {
    mapped.count = row.count
  }
  if (table === "pending_sync_ops") {
    mapped.op_json = row.op_json
  }
  return mapped
}

export const migrateSqliteToPostgres = async (
  dbPath: string,
  pool: Pool,
  sqliteFactory: (path: string) => SqliteReader = (path) =>
    new BDatabase(path, { readonly: true }) as unknown as SqliteReader,
) => {
  const sqlite = sqliteFactory(dbPath)
  try {
    await pool.query("BEGIN")
    const orderedTables = [
      "feeds",
      "subscriptions",
      "inboxes",
      "lists",
      "users",
      "entries",
      "collections",
      "summaries",
      "translations",
      "images",
      "ai_chat_sessions",
      "ai_chat_messages",
      "unread",
      "applied_sync_ops",
      "pending_sync_ops",
    ]
    for (const table of orderedTables) {
      if (!tableExists(sqlite, table)) continue
      const rows = fetchRows(sqlite, table)
      const mapped = rows.map((row) => mapRow(table, row))
      if (mapped.length === 0) continue
      await insertRows(pool, table, mapped)
    }
    await pool.query("COMMIT")
  } catch (error) {
    await pool.query("ROLLBACK")
    throw error
  } finally {
    sqlite.close()
  }
}
