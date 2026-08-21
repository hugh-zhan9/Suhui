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

  it("全新安装（无任何配置）默认 sqlite", () => {
    expect(resolveDbType({})).toBe("sqlite")
  })

  it("DB_TYPE 显式指定时优先", () => {
    expect(resolveDbType({ DB_TYPE: "postgres" })).toBe("postgres")
    expect(resolveDbType({ DB_TYPE: "sqlite" })).toBe("sqlite")
    expect(resolveDbType({ DB_TYPE: " POSTGRES " })).toBe("postgres")
  })

  // 既有 Postgres 安装不得被静默切走：有 DB_CONN 就说明是既有安装
  it("有 DB_CONN 但没写 DB_TYPE 时判定为既有 postgres 安装", () => {
    expect(resolveDbType({ DB_CONN: "127.0.0.1:5432/suhui" })).toBe("postgres")
  })

  it("无法识别的 DB_TYPE 按无配置处理", () => {
    expect(resolveDbType({ DB_TYPE: "mysql" })).toBe("sqlite")
    expect(resolveDbType({ DB_TYPE: "mysql", DB_CONN: "127.0.0.1:5432/suhui" })).toBe("postgres")
  })

  it("既有 override 缺 dbType 时按 postgres 解释", () => {
    expect(
      resolveEffectiveDbConfig({ env: {}, override: { dbConn: "127.0.0.1:5432/suhui" } }).dbType,
    ).toBe("postgres")
  })

  it("sqlite 未配置路径时使用注入的默认路径", () => {
    expect(
      resolveEffectiveDbConfig({ env: {}, defaultSqlitePath: "/tmp/userdata/suhui.db" }),
    ).toMatchObject({ dbType: "sqlite", dbConn: "/tmp/userdata/suhui.db" })
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
