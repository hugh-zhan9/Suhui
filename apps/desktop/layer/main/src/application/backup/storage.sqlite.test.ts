import { DatabaseSync } from "node:sqlite"

import { activateMainDB } from "@suhui/database/db.main"
import { sqliteMigrations } from "@suhui/database/drizzle/sqlite-baseline"
import { afterEach, describe, expect, it } from "vitest"

import type { BackupRecord } from "./format"
import { normalizeSqliteValue, SqliteBackupStorage } from "./storage.sqlite"

const openDatabase = () => {
  const raw = new DatabaseSync(":memory:")
  for (const migration of sqliteMigrations) {
    for (const statement of migration.statements) raw.exec(statement)
  }

  const sqlite = {
    exec: (sql: string) => raw.exec(sql),
    prepare: (sql: string) => {
      const stmt = raw.prepare(sql)
      return {
        all: (...params: unknown[]) => stmt.all(...(params as never[])),
        run: (...params: unknown[]) => {
          const info = stmt.run(...(params as never[]))
          return { changes: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) }
        },
      }
    },
    close: () => raw.close(),
    pragma: () => {},
  }

  activateMainDB({
    type: "sqlite",
    config: { filePath: ":memory:" },
    db: {} as never,
    sqlite,
  })
  return raw
}

const collect = async (storage: SqliteBackupStorage) => {
  const records: BackupRecord[] = []
  for await (const record of storage.streamRecords()) records.push(record)
  return records
}

describe("SqliteBackupStorage", () => {
  let raw: DatabaseSync | null = null

  afterEach(() => {
    raw?.close()
    raw = null
  })

  it("导出按表遍历并生成主键 key", async () => {
    raw = openDatabase()
    raw.exec(
      `insert into feeds (id, url, title) values ('f1', 'https://a', 'A'), ('f2', 'https://b', 'B')`,
    )

    const records = await collect(new SqliteBackupStorage())
    const feeds = records.filter((r) => r.entity === "feeds")

    expect(feeds.map((r) => r.key)).toEqual(['["f1"]', '["f2"]'])
    expect(feeds[0]!.value).toMatchObject({ id: "f1", url: "https://a" })
  })

  it("复合主键的 key 含全部键列", async () => {
    raw = openDatabase()
    raw.exec(`insert into summaries (entry_id, summary, language) values ('e1', 's', 'zh-CN')`)

    const records = await collect(new SqliteBackupStorage())
    expect(records.find((r) => r.entity === "summaries")?.key).toBe('["e1","zh-CN"]')
  })

  it("merge 不复活墓碑：本地存活的行不被备份里的 deleted_at 覆盖", async () => {
    raw = openDatabase()
    raw.exec(`insert into feeds (id, url, deleted_at) values ('f1', 'https://a', null)`)

    const storage = new SqliteBackupStorage()
    const tx = await storage.beginRestore("merge")
    await tx.upsert([
      {
        type: "record",
        entity: "feeds",
        key: '["f1"]',
        value: { id: "f1", url: "https://a", deleted_at: 123 },
      },
    ])
    await tx.commit()

    expect(raw.prepare("select deleted_at from feeds where id='f1'").get()).toMatchObject({
      deleted_at: null,
    })
  })

  it("merge 下 entries.read 单调：本地已读不会被备份的未读覆盖", async () => {
    raw = openDatabase()
    raw.exec(
      `insert into entries (id, feed_id, title, guid, inserted_at, published_at, read)
       values ('e1', 'f1', 't', 'g', 1, 1, 1)`,
    )

    const storage = new SqliteBackupStorage()
    const tx = await storage.beginRestore("merge")
    await tx.upsert([
      {
        type: "record",
        entity: "entries",
        key: '["e1"]',
        value: {
          id: "e1",
          feed_id: "f1",
          title: "t",
          guid: "g",
          inserted_at: 1,
          published_at: 1,
          read: 0,
        },
      },
    ])
    await tx.commit()

    expect(raw.prepare("select read from entries where id='e1'").get()).toMatchObject({ read: 1 })
  })

  it("replace 模式清空业务表与瞬态表", async () => {
    raw = openDatabase()
    raw.exec(`insert into feeds (id, url) values ('f1', 'https://a')`)
    raw.exec(
      `insert into pending_sync_ops (op_id, op_json, retry_after, created_at) values ('o1', '{}', 0, 1)`,
    )

    const storage = new SqliteBackupStorage()
    const tx = await storage.beginRestore("replace")
    await tx.clear()
    await tx.commit()

    expect(raw.prepare("select count(*) c from feeds").get()).toMatchObject({ c: 0 })
    expect(raw.prepare("select count(*) c from pending_sync_ops").get()).toMatchObject({ c: 0 })
  })

  it("回滚后写入不落库", async () => {
    raw = openDatabase()

    const storage = new SqliteBackupStorage()
    const tx = await storage.beginRestore("merge")
    await tx.upsert([
      { type: "record", entity: "feeds", key: '["f9"]', value: { id: "f9", url: "https://x" } },
    ])
    await tx.rollback()

    expect(raw.prepare("select count(*) c from feeds").get()).toMatchObject({ c: 0 })
  })

  it("设置暂存与已应用标记往返", async () => {
    raw = openDatabase()
    const storage = new SqliteBackupStorage()

    const tx = await storage.beginRestore("merge")
    await tx.stageSettings({ appearance: "dark" })
    await tx.commit()

    expect(await storage.readPendingSettings("main")).toEqual({ appearance: "dark" })
    await storage.markSettingsApplied("main")
    expect(await storage.readPendingSettings("main")).toBeNull()
    // renderer 侧独立
    expect(await storage.readPendingSettings("renderer")).toEqual({ appearance: "dark" })
  })

  it("拒绝混合实体的批次", async () => {
    raw = openDatabase()
    const tx = await new SqliteBackupStorage().beginRestore("merge")

    await expect(
      tx.upsert([
        { type: "record", entity: "feeds", key: '["a"]', value: { id: "a" } },
        { type: "record", entity: "entries", key: '["b"]', value: { id: "b" } },
      ]),
    ).rejects.toThrow("one database entity")
    await tx.rollback()
  })
})

describe("normalizeSqliteValue", () => {
  it("布尔转 0/1（SQLite 不接受 JS 布尔）", () => {
    expect(normalizeSqliteValue(true)).toBe(1)
    expect(normalizeSqliteValue(false)).toBe(0)
  })

  it("对象与数组序列化为 JSON 文本", () => {
    expect(normalizeSqliteValue({ a: 1 })).toBe('{"a":1}')
    expect(normalizeSqliteValue(["x"])).toBe('["x"]')
  })

  it("null 与 undefined 归一为 null", () => {
    expect(normalizeSqliteValue(null)).toBeNull()
    expect(normalizeSqliteValue(undefined)).toBeNull()
  })

  it("数字与字符串原样透传", () => {
    expect(normalizeSqliteValue(42)).toBe(42)
    expect(normalizeSqliteValue("s")).toBe("s")
  })
})
