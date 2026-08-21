import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  generateSqliteSchema,
  POSTGRES_SCHEMA_PATH,
  SQLITE_SCHEMA_PATH,
} from "../../scripts/generate-sqlite-schema.mjs"

/**
 * 两个方言必须逐列产出相同的 JS 类型，否则 schemas/types.ts 推导的域类型会变成
 * 联合类型并级联到全仓库。sqlite.ts 由 postgres.ts 机械生成，这里校验产物没有漂移。
 */
describe("sqlite schema 与 postgres 的对齐", () => {
  const postgresSource = readFileSync(POSTGRES_SCHEMA_PATH, "utf8")
  const sqliteSource = readFileSync(SQLITE_SCHEMA_PATH, "utf8")

  it("sqlite.ts 与由 postgres.ts 生成的结果完全一致", () => {
    expect(sqliteSource).toBe(generateSqliteSchema(postgresSource))
  })

  // 表名可能与 pgTable( 同行，也可能换行写，正则需兼容两种
  const tableNames = (source: string, fn: string) =>
    [...source.matchAll(new RegExp(`${fn}\\(\\s*"([a-z_]+)"`, "g"))].map((m) => m[1]).sort()

  it("两侧表数量相同且不少于 27 张", () => {
    const pg = tableNames(postgresSource, "pgTable")
    const sqlite = tableNames(sqliteSource, "sqliteTable")

    expect(sqlite.length).toBe(pg.length)
    expect(pg.length).toBeGreaterThanOrEqual(27)
  })

  it("两侧表名集合相同", () => {
    expect(tableNames(sqliteSource, "sqliteTable")).toEqual(tableNames(postgresSource, "pgTable"))
  })

  it("sqlite 侧不含 postgres 专有列类型", () => {
    expect(sqliteSource).not.toMatch(/\bbigint\(/)
    expect(sqliteSource).not.toMatch(/\bboolean\(/)
    expect(sqliteSource).not.toMatch(/\bjsonb\(/)
  })

  it("时间戳不使用 timestamp_ms 模式（那会返回 Date 而非 number）", () => {
    expect(sqliteSource).not.toContain("timestamp_ms")
  })

  it("sqlite 侧不残留 postgres 的 epoch 默认值表达式", () => {
    expect(sqliteSource).not.toContain("extract(epoch from now())")
    expect(sqliteSource).toContain("unixepoch()")
  })
})
