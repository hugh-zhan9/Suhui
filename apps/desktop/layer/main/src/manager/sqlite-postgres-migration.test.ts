import fs from "node:fs"
import os from "node:os"

import { join } from "pathe"
import { describe, expect, it, vi } from "vitest"

import {
  hasSqliteData,
  isPostgresEmpty,
  migrateSqliteToPostgres,
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
})
