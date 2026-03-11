import { describe, expect, it, vi } from "vitest"

import {
  buildPostgresAdminConfig,
  ensurePostgresDatabaseExists,
  getTargetDatabaseName,
} from "./postgres-bootstrap"

describe("postgres bootstrap", () => {
  it("extracts database name from host:port/dbname", () => {
    expect(getTargetDatabaseName({ DB_CONN: "127.0.0.1:5432/suhui" })).toBe("suhui")
  })

  it("extracts database name from connection string", () => {
    expect(
      getTargetDatabaseName({
        DB_CONN: "postgres://u:p@127.0.0.1:5432/suhui?sslmode=disable",
      }),
    ).toBe("suhui")
  })

  it("builds admin config for host:port", () => {
    expect(
      buildPostgresAdminConfig({
        DB_CONN: "127.0.0.1:5432/suhui",
        DB_USER: "u",
        DB_PASSWORD: "p",
      }),
    ).toEqual({ host: "127.0.0.1", port: 5432, database: "postgres", user: "u", password: "p" })
  })

  it("creates database when missing", async () => {
    const queries: string[] = []
    const poolFactory = () => ({
      query: vi.fn(async (sql: string) => {
        queries.push(sql)
        if (sql.includes("pg_database")) return { rowCount: 0, rows: [] }
        return { rowCount: 0, rows: [] }
      }),
      end: vi.fn(async () => {}),
    })

    await ensurePostgresDatabaseExists(
      { DB_CONN: "127.0.0.1:5432/suhui", DB_USER: "u", DB_PASSWORD: "p" },
      poolFactory,
    )

    expect(queries.some((q) => q.startsWith("CREATE DATABASE"))).toBe(true)
  })
})
