import fs from "node:fs"
import os from "node:os"

import BDatabase from "better-sqlite3"
import { join } from "pathe"
import { describe, expect, it, vi } from "vitest"

import { hasSqliteData, isPostgresEmpty } from "./sqlite-postgres-migration"

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
    const sqlite = new BDatabase(dbPath)
    sqlite.exec("CREATE TABLE entries (id text primary key)")
    sqlite.exec("INSERT INTO entries (id) VALUES ('e1')")
    sqlite.close()

    expect(hasSqliteData(dbPath)).toBe(true)
  })
})
