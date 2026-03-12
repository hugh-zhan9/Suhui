import fs from "node:fs"
import os from "node:os"

import { join } from "pathe"
import { describe, expect, it, vi } from "vitest"

import {
  hasSqliteData,
  isPostgresEmpty,
  migrateSqliteToPostgres,
  parseMigrationArgs,
  resolveLegacySqlitePath,
} from "./sqlite-postgres-migration"

describe("sqlite -> postgres migration helpers", () => {
  it("detects postgres empty by counts", async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("feeds")) return { rows: [{ count: "0" }] }
        if (sql.includes("subscriptions")) return { rows: [{ count: "0" }] }
        if (sql.includes("entries")) return { rows: [{ count: "0" }] }
        return { rows: [{ count: "0" }] }
      }),
    }

    await expect(isPostgresEmpty(pool as any)).resolves.toBe(true)
  })

  it("detects sqlite data when entries exist", () => {
    const tmp = fs.mkdtempSync(join(os.tmpdir(), "folo-sqlite-"))
    const dbPath = join(tmp, "suhui_local.db")
    fs.writeFileSync(dbPath, "")
    const sqliteFactory = () => ({
      prepare: () => ({
        get: () => ({ count: 1 }),
      }),
      close: () => {},
    })

    expect(hasSqliteData(dbPath, sqliteFactory as any)).toBe(true)
  })

  it("resolves legacy sqlite path on macOS", () => {
    const resolved = resolveLegacySqlitePath({
      platform: "darwin",
      homeDir: "/Users/suhui",
    })
    expect(resolved).toBe(
      join("/Users/suhui", "Library", "Application Support", "溯洄", "suhui_local.db"),
    )
  })

  it("resolves legacy sqlite path on Windows using APPDATA", () => {
    const resolved = resolveLegacySqlitePath({
      platform: "win32",
      homeDir: "C:\\Users\\Suhui",
      env: { APPDATA: "C:\\Users\\Suhui\\AppData\\Roaming" },
    })
    expect(resolved).toBe(join("C:\\Users\\Suhui\\AppData\\Roaming", "溯洄", "suhui_local.db"))
  })

  it("resolves legacy sqlite path on Linux using XDG_CONFIG_HOME", () => {
    const resolved = resolveLegacySqlitePath({
      platform: "linux",
      homeDir: "/home/suhui",
      env: { XDG_CONFIG_HOME: "/home/suhui/.config" },
    })
    expect(resolved).toBe(join("/home/suhui/.config", "溯洄", "suhui_local.db"))
  })

  it("parses migration args overrides", () => {
    const parsed = parseMigrationArgs([
      "--sqlite-path",
      "/tmp/legacy.db",
      "--postgres-url",
      "postgres://user:pass@localhost:5432/suhui",
    ])
    expect(parsed).toEqual({
      help: false,
      sqlitePath: "/tmp/legacy.db",
      postgresUrl: "postgres://user:pass@localhost:5432/suhui",
    })
  })

  it("parses help flag", () => {
    const parsed = parseMigrationArgs(["--help"])
    expect(parsed).toEqual({
      help: true,
      sqlitePath: undefined,
      postgresUrl: undefined,
    })
  })

  it("skips missing tables during migration", async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
    }
    const sqlite = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("sqlite_master")) {
          return { get: () => null }
        }
        return {
          all: () => {
            throw new Error("should not select missing tables")
          },
          get: () => null,
        }
      }),
      close: vi.fn(),
    }

    await expect(
      migrateSqliteToPostgres("/tmp/empty.db", pool as any, () => sqlite as any),
    ).resolves.toBeUndefined()
  })

  it("stringifies json fields before inserting into postgres", async () => {
    const calls: { sql: string; values?: unknown[] }[] = []
    const pool = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values })
        return { rows: [] }
      }),
    }
    const row = {
      id: "entry_1",
      guid: "guid_1",
      inserted_at: 1700000000000,
      published_at: 1700000000000,
      read: 1,
      media: '[{"type":"photo","url":"https://example.com/a.png"}]',
    }
    const sqlite = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("sqlite_master")) {
          return { get: () => ({ name: "entries" }) }
        }
        if (sql.startsWith("SELECT * FROM entries")) {
          return { all: () => [row] }
        }
        return { all: () => [], get: () => null }
      }),
      close: vi.fn(),
    }

    await migrateSqliteToPostgres("/tmp/fake.db", pool as any, () => sqlite as any)

    const insert = calls.find((call) => call.sql.includes('INSERT INTO "entries"'))
    if (!insert) {
      throw new Error("Expected entries insert call")
    }
    const match = insert.sql.match(/\(([^)]+)\)\s+VALUES/)
    if (!match) {
      throw new Error("Expected entries insert columns")
    }
    expect(match).toBeTruthy()
    const columnsText = match[1]
    if (!columnsText) {
      throw new Error("Expected entries insert columns text")
    }
    const columns = columnsText.split(",").map((item) => item.trim().replaceAll('"', ""))
    const mediaIndex = columns.indexOf("media")
    expect(mediaIndex).toBeGreaterThan(-1)
    if (mediaIndex === -1) {
      throw new Error("Expected media column in entries insert")
    }
    const { values } = insert
    if (!values) {
      throw new Error("Expected entries insert values")
    }
    const mediaValue = values[mediaIndex]
    expect(typeof mediaValue).toBe("string")
    expect(JSON.parse(mediaValue as string)).toEqual([
      { type: "photo", url: "https://example.com/a.png" },
    ])
  })
})
