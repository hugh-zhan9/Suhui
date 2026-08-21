import { getMainSqlite } from "@suhui/database/db.main"
import * as sqliteSchema from "@suhui/database/schemas/sqlite"
import { getTableColumns, getTableName, is } from "drizzle-orm"
import { SQLiteTable } from "drizzle-orm/sqlite-core"

import type { BackupRecord } from "./format"
import type {
  BackupRestoreTransaction,
  BackupStorage,
  RestoreMode,
  TableDefinition,
} from "./storage"
import { backupTables, definitionsByEntity, quoteIdentifier } from "./storage"

const EXPORT_PAGE_SIZE = 200

type SqliteHandle = ReturnType<typeof getMainSqlite>

const buildRecordKey = (definition: TableDefinition, value: Record<string, unknown>) =>
  JSON.stringify(definition.keyColumns.map((column) => value[column]))

/**
 * 每张表里存 JSON 文本的列（`text(..., {mode:"json"})`）。
 *
 * 备份格式的规范形态是「结构化值」——Postgres 的驱动读 jsonb 就直接给对象，
 * 所以 SQLite 侧导出时必须先 parse，否则同一份 bundle 从 sqlite 导出、灌进
 * postgres 会把 JSON 文本当成 jsonb 的字符串标量存进去（双重编码）。
 * 列名从 drizzle schema 的 `dataType` 推导，新增 JSON 列不需要改这里。
 */
const jsonColumnsByTable = new Map<string, Set<string>>(
  (Object.values(sqliteSchema) as unknown[])
    .filter((value): value is SQLiteTable => is(value, SQLiteTable))
    .map((table) => {
      const columns = getTableColumns(table)
      const jsonColumns = new Set(
        Object.values(columns)
          .filter((column) => column.dataType === "json")
          .map((column) => column.name),
      )
      return [getTableName(table), jsonColumns] as const
    })
    .filter(([, jsonColumns]) => jsonColumns.size > 0),
)

/** 把一行里的 JSON 文本列还原成结构化值；非 JSON 列原样透传。 */
const parseJsonColumns = (table: string, row: Record<string, unknown>) => {
  const jsonColumns = jsonColumnsByTable.get(table)
  if (!jsonColumns) return row

  for (const column of jsonColumns) {
    const value = row[column]
    if (typeof value !== "string") continue
    try {
      row[column] = JSON.parse(value)
    } catch {
      // 存进去的不是合法 JSON：原样带走，交给恢复端处理，不在导出期丢数据
    }
  }
  return row
}

/**
 * SQLite 侧的备份存储。语义与 PostgresBackupStorage 逐条对齐：
 * merge 不复活墓碑、entries.read 单调、有 updated_at 的表按新鲜度设闸。
 *
 * 实现差异：
 *  - 没有服务端游标，用键序分页扫描代替（SQLite 的读在事务外也是一致快照粒度足够）
 *  - 没有 LOCK TABLE，用 BEGIN IMMEDIATE 拿写锁（SQLite 是整库级写锁）
 *  - 没有 json_populate_recordset，用多行 VALUES 参数化插入
 */
export class SqliteBackupStorage implements BackupStorage {
  async *streamRecords(): AsyncIterable<BackupRecord> {
    const sqlite = getMainSqlite()

    for (const definition of backupTables) {
      const orderBy = definition.keyColumns.map(quoteIdentifier).join(", ")
      let offset = 0

      while (true) {
        const rows = sqlite
          .prepare(
            `SELECT * FROM ${quoteIdentifier(definition.table)} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
          )
          .all(EXPORT_PAGE_SIZE, offset) as Record<string, unknown>[]

        if (rows.length === 0) break

        for (const row of rows) {
          yield {
            type: "record",
            entity: definition.entity,
            key: buildRecordKey(definition, row),
            value: parseJsonColumns(definition.table, row),
          }
        }

        if (rows.length < EXPORT_PAGE_SIZE) break
        offset += rows.length
      }
    }
  }

  async beginRestore(mode: RestoreMode = "merge"): Promise<BackupRestoreTransaction> {
    const sqlite = getMainSqlite()
    sqlite.exec("BEGIN IMMEDIATE")
    return new SqliteRestoreTransaction(sqlite, mode)
  }

  async readPendingSettings(target: "main" | "renderer") {
    const sqlite = getMainSqlite()
    const appliedColumn = target === "main" ? "main_applied" : "renderer_applied"
    const rows = sqlite
      .prepare(
        `SELECT settings FROM backup_restore_settings WHERE id = 1 AND ${quoteIdentifier(appliedColumn)} = 0`,
      )
      .all() as { settings: string | null }[]

    const raw = rows[0]?.settings
    if (!raw) return null
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  }

  async markSettingsApplied(target: "main" | "renderer") {
    const sqlite = getMainSqlite()
    const appliedColumn = target === "main" ? "main_applied" : "renderer_applied"
    sqlite
      .prepare(
        `UPDATE backup_restore_settings SET ${quoteIdentifier(appliedColumn)} = 1 WHERE id = 1`,
      )
      .run()
  }
}

class SqliteRestoreTransaction implements BackupRestoreTransaction {
  private finished = false

  constructor(
    private readonly sqlite: SqliteHandle,
    private readonly mode: RestoreMode,
  ) {}

  async clear() {
    // 与 postgres 侧一致：先清瞬态表，再逆序清业务表
    this.sqlite.prepare("DELETE FROM pending_sync_ops").run()
    this.sqlite.prepare("DELETE FROM content_cluster_rebuild_state").run()
    for (const definition of [...backupTables].reverse()) {
      this.sqlite.prepare(`DELETE FROM ${quoteIdentifier(definition.table)}`).run()
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

    const table = quoteIdentifier(definition.table)
    const quotedColumns = columns.map(quoteIdentifier).join(", ")
    const conflictColumns = definition.keyColumns.map(quoteIdentifier).join(", ")
    const nonKeyColumns = columns.filter((column) => !definition.keyColumns.includes(column))

    const updateClause = nonKeyColumns
      .map((column) => {
        const quoted = quoteIdentifier(column)
        if (this.mode === "merge" && column === "deleted_at") {
          // 本地仍存活的行不因备份里的墓碑而被删除
          return `${quoted} = CASE WHEN ${table}.${quoted} IS NULL THEN NULL ELSE excluded.${quoted} END`
        }
        if (this.mode === "merge" && definition.entity === "entries" && column === "read") {
          // 已读状态单调
          return `${quoted} = (${table}.${quoted} IS TRUE OR excluded.${quoted} IS TRUE)`
        }
        return `${quoted} = excluded.${quoted}`
      })
      .join(", ")

    const freshnessGuard =
      this.mode === "merge" && columns.includes("updated_at")
        ? ` WHERE excluded.${quoteIdentifier("updated_at")} >= ${table}.${quoteIdentifier("updated_at")}`
        : ""

    const conflictAction = updateClause
      ? `DO UPDATE SET ${updateClause}${freshnessGuard}`
      : "DO NOTHING"

    const rowPlaceholder = `(${columns.map(() => "?").join(", ")})`
    const values = records.flatMap((record) =>
      columns.map((column) => normalizeSqliteValue(record.value[column])),
    )

    this.sqlite
      .prepare(
        `INSERT INTO ${table} (${quotedColumns}) VALUES ${records.map(() => rowPlaceholder).join(", ")} ON CONFLICT (${conflictColumns}) ${conflictAction}`,
      )
      .run(...values)
  }

  async stageSettings(settings: Record<string, unknown>) {
    this.sqlite
      .prepare(
        `INSERT INTO backup_restore_settings (id, settings, main_applied, renderer_applied, created_at)
         VALUES (1, ?, 0, 0, ?)
         ON CONFLICT (id) DO UPDATE SET settings = excluded.settings, main_applied = 0,
           renderer_applied = 0, created_at = excluded.created_at`,
      )
      .run(JSON.stringify(settings), Date.now())
  }

  async commit() {
    if (this.finished) return
    this.sqlite.exec("COMMIT")
    this.finished = true
  }

  async rollback() {
    if (this.finished) return
    try {
      this.sqlite.exec("ROLLBACK")
    } finally {
      this.finished = true
    }
  }
}

/**
 * 备份记录来自 postgres 的 `row_to_json`，带 JS 原生类型；SQLite 只接受
 * 数字/字符串/BigInt/Buffer/null，因此布尔与对象要在此转换。
 */
export const normalizeSqliteValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return null
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "object") return JSON.stringify(value)
  return value
}
