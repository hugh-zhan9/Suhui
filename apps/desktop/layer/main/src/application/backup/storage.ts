import type { PoolClient } from "pg"

import { getMainPgPool } from "@suhui/database/db.main"

import type { BackupEntity, BackupRecord } from "./format"

export type RestoreMode = "merge" | "replace"

type TableDefinition = {
  entity: Exclude<BackupEntity, "settings">
  table: string
  keyColumns: string[]
}

const tables: TableDefinition[] = [
  { entity: "feeds", table: "feeds", keyColumns: ["id"] },
  { entity: "subscriptions", table: "subscriptions", keyColumns: ["id"] },
  { entity: "inboxes", table: "inboxes", keyColumns: ["id"] },
  { entity: "lists", table: "lists", keyColumns: ["id"] },
  { entity: "unread", table: "unread", keyColumns: ["subscription_id"] },
  { entity: "users", table: "users", keyColumns: ["id"] },
  { entity: "entries", table: "entries", keyColumns: ["id"] },
  { entity: "collections", table: "collections", keyColumns: ["entry_id"] },
  { entity: "summaries", table: "summaries", keyColumns: ["entry_id", "language"] },
  { entity: "translations", table: "translations", keyColumns: ["entry_id", "language"] },
  { entity: "ai_chat_sessions", table: "ai_chat_sessions", keyColumns: ["id"] },
  { entity: "ai_chat_messages", table: "ai_chat_messages", keyColumns: ["id"] },
  { entity: "applied_sync_ops", table: "applied_sync_ops", keyColumns: ["op_id"] },
  { entity: "content_clusters", table: "content_clusters", keyColumns: ["id"] },
  {
    entity: "content_cluster_members",
    table: "content_cluster_members",
    keyColumns: ["entry_id"],
  },
  {
    entity: "content_cluster_exclusions",
    table: "content_cluster_exclusions",
    keyColumns: ["entry_id"],
  },
  { entity: "entry_rules", table: "entry_rules", keyColumns: ["id"] },
  {
    entity: "entry_rule_applications",
    table: "entry_rule_applications",
    keyColumns: ["rule_id", "entry_id", "rule_version"],
  },
  { entity: "entry_user_state", table: "entry_user_state", keyColumns: ["entry_id"] },
  { entity: "entry_tags", table: "entry_tags", keyColumns: ["entry_id", "tag"] },
  { entity: "entry_notes", table: "entry_notes", keyColumns: ["id"] },
  { entity: "entry_highlights", table: "entry_highlights", keyColumns: ["id"] },
  { entity: "reading_queue", table: "reading_queue", keyColumns: ["entry_id"] },
]

const definitionsByEntity = new Map<BackupEntity, TableDefinition>(
  tables.map((definition) => [definition.entity, definition]),
)

export type BackupRestoreTransaction = {
  clear(): Promise<void>
  upsert(records: BackupRecord[]): Promise<void>
  stageSettings(settings: Record<string, unknown>): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
}

export interface BackupStorage {
  streamRecords(): AsyncIterable<BackupRecord>
  beginRestore(mode?: RestoreMode): Promise<BackupRestoreTransaction>
  readPendingSettings(target: "main" | "renderer"): Promise<Record<string, unknown> | null>
  markSettingsApplied(target: "main" | "renderer"): Promise<void>
}

const quoteIdentifier = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`

const keyFor = (value: Record<string, unknown>, columns: string[]) =>
  JSON.stringify(columns.map((column) => value[column]))

export class PostgresBackupStorage implements BackupStorage {
  async *streamRecords(): AsyncGenerator<BackupRecord> {
    const client = await getMainPgPool().connect()
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
      let cursorIndex = 0
      for (const definition of tables) {
        const cursor = `suhui_backup_${cursorIndex++}`
        const order = definition.keyColumns.map(quoteIdentifier).join(", ")
        await client.query(
          `DECLARE ${quoteIdentifier(cursor)} NO SCROLL CURSOR FOR SELECT row_to_json(t) AS value FROM ${quoteIdentifier(definition.table)} t ORDER BY ${order}`,
        )
        while (true) {
          const result = await client.query<{ value: Record<string, unknown> }>(
            `FETCH FORWARD 200 FROM ${quoteIdentifier(cursor)}`,
          )
          if (result.rows.length === 0) break
          for (const row of result.rows) {
            yield {
              type: "record",
              entity: definition.entity,
              key: keyFor(row.value, definition.keyColumns),
              value: row.value,
            }
          }
        }
        await client.query(`CLOSE ${quoteIdentifier(cursor)}`)
      }
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async beginRestore(mode: RestoreMode = "merge"): Promise<BackupRestoreTransaction> {
    const client = await getMainPgPool().connect()
    try {
      await client.query("BEGIN")
      // Lock parents before dependants to avoid conflicting lock order with normal writes.
      const lockedTables = [
        ...tables.map((definition) => definition.table),
        "pending_sync_ops",
        "backup_restore_settings",
        "content_cluster_rebuild_state",
      ]
      await client.query(
        `LOCK TABLE ${Array.from(new Set(lockedTables)).map(quoteIdentifier).join(", ")} IN ACCESS EXCLUSIVE MODE`,
      )
      // A new restore supersedes any older renderer projection. Keeping this
      // delete in the same transaction preserves the previous journal if the
      // new restore rolls back.
      await client.query("DELETE FROM backup_restore_settings WHERE id = 1")
      return new PostgresRestoreTransaction(client, mode)
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      client.release()
      throw error
    }
  }

  async readPendingSettings(target: "main" | "renderer") {
    const appliedColumn = target === "main" ? "main_applied" : "renderer_applied"
    const result = await getMainPgPool().query<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM backup_restore_settings WHERE id = 1 AND ${appliedColumn} IS FALSE`,
    )
    return result.rows[0]?.settings ?? null
  }

  async markSettingsApplied(target: "main" | "renderer") {
    const appliedColumn = target === "main" ? "main_applied" : "renderer_applied"
    await getMainPgPool().query(
      `UPDATE backup_restore_settings SET ${appliedColumn} = TRUE WHERE id = 1`,
    )
  }
}

class PostgresRestoreTransaction implements BackupRestoreTransaction {
  private finished = false

  constructor(
    private readonly client: PoolClient,
    private readonly mode: RestoreMode,
  ) {}

  async clear() {
    // Pending work is transient and must not mutate the restored snapshot later.
    // The applied-op ledger is portable and restored from the bundle so historical
    // sync operations remain idempotent.
    await this.client.query('DELETE FROM "pending_sync_ops"')
    await this.client.query('DELETE FROM "content_cluster_rebuild_state"')
    for (const definition of [...tables].reverse()) {
      await this.client.query(`DELETE FROM ${quoteIdentifier(definition.table)}`)
    }
  }

  async upsert(records: BackupRecord[]) {
    if (records.length === 0) return
    const definition = definitionsByEntity.get(records[0]!.entity)
    if (!definition || records.some((record) => record.entity !== definition.entity)) {
      throw new Error("Restore batches must contain one database entity")
    }
    const columns = Object.keys(records[0]!.value)
    if (
      columns.length === 0 ||
      records.some((record) => Object.keys(record.value).join("\0") !== columns.join("\0"))
    ) {
      throw new Error(`Inconsistent columns for ${definition.entity}`)
    }
    const nonKeyColumns = columns.filter((column) => !definition.keyColumns.includes(column))
    const quotedColumns = columns.map(quoteIdentifier).join(", ")
    const conflictColumns = definition.keyColumns.map(quoteIdentifier).join(", ")
    const updateClause = nonKeyColumns
      .map((column) => {
        const quoted = quoteIdentifier(column)
        if (this.mode === "merge" && column === "deleted_at") {
          return `${quoted} = CASE WHEN ${quoteIdentifier(definition.table)}.${quoted} IS NULL THEN NULL ELSE EXCLUDED.${quoted} END`
        }
        if (this.mode === "merge" && definition.entity === "entries" && column === "read") {
          return `${quoted} = (${quoteIdentifier(definition.table)}.${quoted} IS TRUE OR EXCLUDED.${quoted} IS TRUE)`
        }
        return `${quoted} = EXCLUDED.${quoted}`
      })
      .join(", ")
    const hasUpdatedAt = columns.includes("updated_at")
    const freshnessGuard =
      this.mode === "merge" && hasUpdatedAt
        ? ` WHERE EXCLUDED.${quoteIdentifier("updated_at")} >= ${quoteIdentifier(definition.table)}.${quoteIdentifier("updated_at")}`
        : ""
    const conflictAction = updateClause
      ? `DO UPDATE SET ${updateClause}${freshnessGuard}`
      : "DO NOTHING"
    await this.client.query(
      `INSERT INTO ${quoteIdentifier(definition.table)} (${quotedColumns}) SELECT ${quotedColumns} FROM json_populate_recordset(NULL::${quoteIdentifier(definition.table)}, $1::json) ON CONFLICT (${conflictColumns}) ${conflictAction}`,
      [JSON.stringify(records.map((record) => record.value))],
    )
  }

  async stageSettings(settings: Record<string, unknown>) {
    await this.client.query(
      `INSERT INTO backup_restore_settings (id, settings, main_applied, renderer_applied, created_at)
       VALUES (1, $1::jsonb, FALSE, FALSE, $2)
       ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, main_applied = FALSE,
         renderer_applied = FALSE, created_at = EXCLUDED.created_at`,
      [JSON.stringify(settings), Date.now()],
    )
  }

  async commit() {
    if (this.finished) return
    try {
      await this.client.query("COMMIT")
      this.finished = true
    } catch (error) {
      await this.client.query("ROLLBACK").catch(() => undefined)
      this.finished = true
      throw error
    } finally {
      this.client.release()
    }
  }

  async rollback() {
    if (this.finished) return
    this.finished = true
    try {
      await this.client.query("ROLLBACK")
    } finally {
      this.client.release()
    }
  }
}
