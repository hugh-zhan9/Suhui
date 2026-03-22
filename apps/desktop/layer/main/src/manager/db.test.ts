import { describe, expect, it, vi } from "vitest"

vi.mock("@suhui/database/db.main", () => ({
  getMainDB: vi.fn(),
  getMainPgPool: vi.fn(),
  initializeMainDB: vi.fn(),
  migrateMainDB: vi.fn(),
}))

import { buildPgConfig } from "./db-config"
import { DBManager } from "./db"

describe("db manager", () => {
  it("defaults to postgres dialect", () => {
    expect(DBManager.getDialect()).toBe("postgres")
  })

  it("builds postgres config from env", () => {
    const config = buildPgConfig({
      DB_TYPE: "postgres",
      DB_CONN: "127.0.0.1:5432/suhui",
      DB_USER: "u",
      DB_PASSWORD: "p",
    })
    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 5432,
      database: "suhui",
      user: "u",
      password: "p",
      connectionTimeoutMillis: 5000,
    })
  })
})
