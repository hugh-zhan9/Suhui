import { describe, expect, it } from "vitest"

import { parseDbConn, resolveDbType } from "./db-config"

describe("db-config", () => {
  it("parses host:port/dbname", () => {
    expect(parseDbConn("127.0.0.1:5432/suhui")).toEqual({
      host: "127.0.0.1",
      port: 5432,
      database: "suhui",
    })
  })

  it("passes DSN through", () => {
    expect(parseDbConn("postgres://u:p@localhost:5432/suhui?sslmode=require")).toEqual({
      connectionString: "postgres://u:p@localhost:5432/suhui?sslmode=require",
    })
  })

  it("defaults db type to postgres", () => {
    expect(resolveDbType({})).toBe("postgres")
  })
})
