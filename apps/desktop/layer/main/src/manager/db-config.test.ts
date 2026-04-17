import { describe, expect, it } from "vitest"

import { parseDbConn, resolveDbType, resolveEffectiveDbConfig } from "./db-config"

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

  it("resolves effective config from env when no override is present", () => {
    expect(
      resolveEffectiveDbConfig({
        env: {
          DB_CONN: "127.0.0.1:5432/suhui",
          DB_USER: "postgres",
          DB_PASSWORD: "secret",
        },
      }),
    ).toEqual({
      dbType: "postgres",
      dbConn: "127.0.0.1:5432/suhui",
      dbUser: "postgres",
      dbPassword: "secret",
      source: "env",
    })
  })

  it("prefers persisted override values over env", () => {
    expect(
      resolveEffectiveDbConfig({
        env: {
          DB_CONN: "127.0.0.1:5432/env_db",
          DB_USER: "env_user",
          DB_PASSWORD: "env_pass",
        },
        override: {
          dbConn: "127.0.0.1:5432/override_db",
          dbUser: "override_user",
          dbPassword: "override_pass",
        },
      }),
    ).toEqual({
      dbType: "postgres",
      dbConn: "127.0.0.1:5432/override_db",
      dbUser: "override_user",
      dbPassword: "override_pass",
      source: "store-override",
    })
  })
})
