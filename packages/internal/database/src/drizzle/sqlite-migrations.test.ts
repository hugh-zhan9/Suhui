import { readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import path from "pathe"
import { describe, expect, it } from "vitest"

import * as sqliteSchema from "../schemas/sqlite"

/**
 * 把 drizzle-kit 生成的 sqlite 迁移链完整应用到内存库，验证：
 * 1. 全部语句在真实 SQLite 引擎上可执行
 * 2. 27 张表齐全，且与 schemas/sqlite.ts 的定义一致
 * 3. 经 drizzle 的 sqlite 方言能真实读写
 *
 * 这里用 Node 内置的 node:sqlite 而不是 better-sqlite3：后者的二进制按 Electron
 * ABI 编译（app 需要），在 vitest 的 Node 运行时里加载不了。两者共用同一套
 * drizzle sqlite 方言，生成的 SQL 完全一致。
 */
const drizzleDir = path.dirname(fileURLToPath(import.meta.url))

const readJournal = () =>
  JSON.parse(readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as {
    dialect: string
    entries: Array<{ idx: number; tag: string }>
  }

const applyMigrations = (db: DatabaseSync) => {
  const journal = readJournal()
  const ordered = [...journal.entries].sort((a, b) => a.idx - b.idx)

  for (const entry of ordered) {
    const sql = readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8")
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim()
      if (trimmed) db.exec(trimmed)
    }
  }
  return ordered.length
}

const listTables = (db: DatabaseSync) =>
  (
    db
      .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'")
      .all() as Array<{ name: string }>
  )
    .map((row) => row.name)
    .sort()

const schemaTableNames = () => {
  const source = readFileSync(path.join(drizzleDir, "../schemas/sqlite.ts"), "utf8")
  return [...source.matchAll(/sqliteTable\(\s*"([a-z_]+)"/g)].map((m) => m[1]!).sort()
}

describe("sqlite 迁移链", () => {
  it("全部迁移可在真实 SQLite 引擎上依序执行", () => {
    const db = new DatabaseSync(":memory:")
    const applied = applyMigrations(db)

    expect(applied).toBeGreaterThanOrEqual(1)
    // 断言基线确实建出了库，而不是空跑
    expect(listTables(db).length).toBeGreaterThanOrEqual(27)
    db.close()
  })

  it("journal 与磁盘上的 SQL 文件一一对应", () => {
    const journal = readJournal()

    expect(journal.dialect).toBe("sqlite")
    for (const entry of journal.entries) {
      expect(() => readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8")).not.toThrow()
    }
  })

  it("迁移后的表集合覆盖 schema 定义的全部 27 张表", () => {
    const db = new DatabaseSync(":memory:")
    applyMigrations(db)

    const actual = listTables(db)
    const expected = schemaTableNames()

    expect(expected.length).toBeGreaterThanOrEqual(27)
    expect(actual).toEqual(expect.arrayContaining(expected))
    db.close()
  })

  it("经 drizzle sqlite 方言可读写，且时间戳是 number", async () => {
    const raw = new DatabaseSync(":memory:")
    applyMigrations(raw)

    const db = drizzle(async (sql, params, method) => {
      const stmt = raw.prepare(sql)
      if (method === "run") {
        stmt.run(...(params as never[]))
        return { rows: [] }
      }
      const rows = (stmt.all(...(params as never[])) as Record<string, unknown>[]).map((r) =>
        Object.values(r),
      )
      return { rows: method === "get" ? (rows[0] ?? []) : rows }
    })

    await db.insert(sqliteSchema.feedsTable).values({
      id: "feed-1",
      url: "https://example.com/atom.xml",
      title: "鸟窝",
      updatedAt: 1787000000000,
    })

    const rows = await db
      .select()
      .from(sqliteSchema.feedsTable)
      .where(eq(sqliteSchema.feedsTable.id, "feed-1"))

    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe("鸟窝")
    expect(typeof rows[0]!.updatedAt).toBe("number")
    raw.close()
  })

  it("jsonb 对应列在 sqlite 侧按 JSON 文本往返", async () => {
    const raw = new DatabaseSync(":memory:")
    applyMigrations(raw)

    const db = drizzle(async (sql, params, method) => {
      const stmt = raw.prepare(sql)
      if (method === "run") {
        stmt.run(...(params as never[]))
        return { rows: [] }
      }
      const rows = (stmt.all(...(params as never[])) as Record<string, unknown>[]).map((r) =>
        Object.values(r),
      )
      return { rows: method === "get" ? (rows[0] ?? []) : rows }
    })

    await db.insert(sqliteSchema.entriesTable).values({
      id: "entry-1",
      feedId: "feed-1",
      title: "标题",
      guid: "g1",
      insertedAt: 1787000000000,
      publishedAt: 1787000000000,
      categories: ["AI", "Coding"],
    })

    const rows = await db.select().from(sqliteSchema.entriesTable)

    expect(rows[0]!.categories).toEqual(["AI", "Coding"])
    raw.close()
  })
})

describe("sqlite 迁移账本", () => {
  const ledger = "__suhui_migrations"

  /** 复刻 db.main.ts 的 migrateMainSqliteDB 逻辑，验证幂等语义 */
  const migrate = (db: DatabaseSync) => {
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${ledger} (tag text primary key, applied_at integer not null)`,
    )
    const applied = new Set(
      (db.prepare(`select tag from ${ledger}`).all() as { tag: string }[]).map((r) => r.tag),
    )
    let count = 0
    for (const migration of readJournal().entries.sort((a, b) => a.idx - b.idx)) {
      if (applied.has(migration.tag)) continue
      const sql = readFileSync(path.join(drizzleDir, `${migration.tag}.sql`), "utf8")
      for (const chunk of sql.split("--> statement-breakpoint")) {
        const trimmed = chunk.trim()
        if (trimmed) db.exec(trimmed)
      }
      db.prepare(`insert into ${ledger} (tag, applied_at) values (?, ?)`).run(
        migration.tag,
        Date.now(),
      )
      count += 1
    }
    return count
  }

  it("第二次运行不再重复应用（drizzle-kit 生成的是裸 CREATE TABLE，必须靠账本幂等）", () => {
    const db = new DatabaseSync(":memory:")

    expect(migrate(db)).toBeGreaterThanOrEqual(1)
    expect(migrate(db)).toBe(0)
    db.close()
  })

  it("账本表与业务表共存", () => {
    const db = new DatabaseSync(":memory:")
    migrate(db)

    const tables = listTables(db)
    expect(tables).toContain(ledger)
    expect(tables.filter((t) => t !== ledger).length).toBeGreaterThanOrEqual(27)
    db.close()
  })
})
