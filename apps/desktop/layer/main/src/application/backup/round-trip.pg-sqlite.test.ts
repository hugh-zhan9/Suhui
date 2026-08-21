import { DatabaseSync } from "node:sqlite"

import { activateMainDB, migrateMainDB } from "@suhui/database/db.main"
import { sqliteMigrations } from "@suhui/database/drizzle/sqlite-baseline"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { BackupRecord } from "./format"
import { PostgresBackupStorage } from "./storage"
import { SqliteBackupStorage } from "./storage.sqlite"

/**
 * 真实的 pg → sqlite 保真测试。
 *
 * mock 出来的服务层测试证明不了类型强制这一层：boolean 在 pg 是 `true`、在 sqlite 是 1；
 * jsonb 在 pg 回来是对象、在 sqlite 是 JSON 文本；bigint 时间戳经 pg 驱动回来是字符串。
 * 这些只有让两套 storage 各自打在真实引擎上才会暴露。
 *
 * 需要一个一次性 Postgres：
 *   docker run -d --rm --name suhui-conv-probe -e POSTGRES_PASSWORD=probe \
 *     -e POSTGRES_DB=suhui_probe -p 55432:5432 postgres:16-alpine
 * 没有它时整个套件跳过，不影响常规 CI。
 */
const PG_URL =
  process.env.SUHUI_TEST_PG_URL ?? "postgres://postgres:probe@127.0.0.1:55432/suhui_probe"

const openSqlite = () => {
  const raw = new DatabaseSync(":memory:")
  for (const migration of sqliteMigrations) {
    for (const statement of migration.statements) raw.exec(statement)
  }
  return {
    raw,
    handle: {
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
    },
  }
}

const reachable = await (async () => {
  const probe = new Pool({ connectionString: PG_URL, connectionTimeoutMillis: 2000 })
  try {
    await probe.query("select 1")
    return true
  } catch {
    return false
  } finally {
    await probe.end().catch(() => {})
  }
})()

describe.skipIf(!reachable)("pg → sqlite 真实往返", () => {
  let pgPool: Pool
  let sqlite: ReturnType<typeof openSqlite>

  beforeAll(async () => {
    pgPool = new Pool({ connectionString: PG_URL })

    // 1. 在真实 pg 上建表并写入覆盖各类型的数据
    activateMainDB({ type: "postgres", config: {}, db: {} as never, pgPool })
    await migrateMainDB()
    await pgPool.query(`truncate feeds, subscriptions, entries, users restart identity cascade`)
    await pgPool.query(`insert into users (id, name, handle) values ('u1', 'Local User', 'local')`)
    await pgPool.query(
      `insert into feeds (id, title, url, description, image) values
        ('f1', '博客', 'https://example.com/feed.xml', '描述', null)`,
    )
    await pgPool.query(
      `insert into subscriptions (id, type, feed_id, user_id, view, category, title, is_private, hide_from_timeline, created_at)
       values ('s1', 'feed', 'f1', 'u1', 0, '技术', '博客', true, false, '2026-08-20T00:00:00Z')`,
    )
    // read=true 与 read=null 各一条：布尔与空值都要跨方言保真
    await pgPool.query(
      `insert into entries (id, feed_id, title, url, guid, read, published_at, inserted_at, categories, sources, media)
       values
        ('e1', 'f1', '已读文章', 'https://example.com/1', 'g1', true,  1755648000000, 1755648000000,
         '["tech","rss"]'::jsonb, '["feed"]'::jsonb, '[{"url":"https://example.com/a.png","type":"photo"}]'::jsonb),
        ('e2', 'f1', '未读文章', 'https://example.com/2', 'g2', null, 1755648001000, 1755648001000,
         null, null, null)`,
    )
  }, 60_000)

  afterAll(async () => {
    await pgPool?.end().catch(() => {})
    sqlite?.raw.close()
  })

  it("导出的记录逐条灌进 sqlite 后，值与类型都对得上", async () => {
    // 2. 从 pg 导出
    activateMainDB({ type: "postgres", config: {}, db: {} as never, pgPool })
    const exported: BackupRecord[] = []
    for await (const record of new PostgresBackupStorage().streamRecords()) exported.push(record)

    expect(exported.filter((r) => r.entity === "entries")).toHaveLength(2)
    expect(exported.filter((r) => r.entity === "feeds")).toHaveLength(1)
    expect(exported.filter((r) => r.entity === "subscriptions")).toHaveLength(1)

    // 3. 灌进真实 sqlite
    sqlite = openSqlite()
    activateMainDB({
      type: "sqlite",
      config: { filePath: ":memory:" },
      db: {} as never,
      sqlite: sqlite.handle,
    })

    const tx = await new SqliteBackupStorage().beginRestore("replace")
    await tx.clear()
    // 按实体分组灌入：upsert 只接受同实体的一批（混实体会被拒绝）
    const byEntity = new Map<string, BackupRecord[]>()
    for (const record of exported) {
      const bucket = byEntity.get(record.entity) ?? []
      bucket.push(record)
      byEntity.set(record.entity, bucket)
    }
    for (const batch of byEntity.values()) await tx.upsert(batch)
    await tx.commit()

    // 4. 逐字段核对
    const entries = sqlite.raw
      .prepare(
        `select id, title, read, published_at, categories, sources, media from entries order by id`,
      )
      .all() as Array<Record<string, unknown>>

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ id: "e1", title: "已读文章", read: 1 })
    expect(entries[1]).toMatchObject({ id: "e2", title: "未读文章", read: null })

    // bigint 时间戳：pg 驱动回来是字符串，落到 sqlite 必须是数字且值不变
    expect(entries[0]!.published_at).toBe(1755648000000)
    expect(typeof entries[0]!.published_at).toBe("number")

    // jsonb → sqlite 的 JSON 文本列：内容不变，且能被 json_each 读到
    expect(JSON.parse(entries[0]!.categories as string)).toEqual(["tech", "rss"])
    expect(JSON.parse(entries[0]!.media as string)).toEqual([
      { url: "https://example.com/a.png", type: "photo" },
    ])
    expect(entries[1]!.categories).toBeNull()

    const bySource = sqlite.raw
      .prepare(
        `select id from entries where exists (select 1 from json_each(sources) where json_each.value = ?)`,
      )
      .all("feed") as Array<{ id: string }>
    expect(bySource.map((row) => row.id)).toEqual(["e1"])

    // 布尔在 subscriptions 上同样要保真
    const subscription = sqlite.raw
      .prepare(`select is_private, hide_from_timeline, view, category from subscriptions`)
      .get() as Record<string, unknown>
    expect(subscription).toMatchObject({
      is_private: 1,
      hide_from_timeline: 0,
      view: 0,
      category: "技术",
    })
  }, 60_000)

  it("反向 sqlite → pg：布尔与 JSON 列回到 pg 的原生类型", async () => {
    // 从上一步已经灌好的 sqlite 再导出，打回一个干净的 pg
    activateMainDB({
      type: "sqlite",
      config: { filePath: ":memory:" },
      db: {} as never,
      sqlite: sqlite.handle,
    })

    const fromSqlite: BackupRecord[] = []
    for await (const record of new SqliteBackupStorage().streamRecords()) fromSqlite.push(record)
    expect(fromSqlite.filter((r) => r.entity === "entries")).toHaveLength(2)

    activateMainDB({ type: "postgres", config: {}, db: {} as never, pgPool })
    const tx = await new PostgresBackupStorage().beginRestore("replace")
    await tx.clear()
    const byEntity = new Map<string, BackupRecord[]>()
    for (const record of fromSqlite) {
      const bucket = byEntity.get(record.entity) ?? []
      bucket.push(record)
      byEntity.set(record.entity, bucket)
    }
    for (const batch of byEntity.values()) await tx.upsert(batch)
    await tx.commit()

    const { rows } = await pgPool.query<{
      id: string
      read: boolean | null
      published_at: string | null
      categories: unknown
      sources: unknown
    }>(`select id, read, published_at, categories, sources from entries order by id`)

    expect(rows).toHaveLength(2)
    // sqlite 的 1/0/null 必须还原成 pg 的 boolean，而不是留成数字
    expect(rows[0]!.read).toBe(true)
    expect(rows[1]!.read).toBeNull()
    // bigint 经 pg 驱动回来是字符串，值不能漂
    expect(rows[0]!.published_at).toBe("1755648000000")
    // JSON 文本必须回到 jsonb 的原生结构，而不是被当成字符串再包一层
    expect(rows[0]!.categories).toEqual(["tech", "rss"])
    expect(rows[0]!.sources).toEqual(["feed"])
    expect(rows[1]!.categories).toBeNull()

    const { rows: subscriptionRows } = await pgPool.query<{
      is_private: boolean
      hide_from_timeline: boolean | null
    }>(`select is_private, hide_from_timeline from subscriptions`)
    expect(subscriptionRows[0]).toEqual({ is_private: true, hide_from_timeline: false })
  }, 60_000)
})
