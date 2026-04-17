import { describe, expect, it } from "vitest"

import { buildDbConfigView } from "./db-config-view"
import type { EnvLoadInfo } from "./env-loader"

describe("buildDbConfigView", () => {
  it("masks password and exposes env source", () => {
    const envInfo: EnvLoadInfo = {
      candidates: ["/res/.env", "/user/.env"],
      active: "/user/.env",
    }

    const result = buildDbConfigView({
      env: {
        DB_TYPE: "postgres",
        DB_CONN: "127.0.0.1:5432/suhui",
        DB_USER: "postgres",
        DB_PASSWORD: "secret",
      },
      envInfo,
    })

    expect(result).toEqual({
      dbType: "postgres",
      dbConn: "127.0.0.1:5432/suhui",
      dbUser: "postgres",
      dbPasswordMasked: "***",
      effectiveSource: "env",
      overrideActive: false,
      envSource: "/user/.env",
      envCandidates: ["/res/.env", "/user/.env"],
    })
  })

  it("reports override metadata when store override is active", () => {
    const result = buildDbConfigView({
      env: {
        DB_CONN: "127.0.0.1:5432/env_db",
        DB_USER: "env_user",
        DB_PASSWORD: "env_secret",
      },
      override: {
        dbConn: "127.0.0.1:5432/override_db",
        dbUser: "override_user",
        dbPassword: "override_secret",
      },
      envInfo: { candidates: ["/res/.env"], active: "/res/.env" },
    })

    expect(result).toEqual({
      dbType: "postgres",
      dbConn: "127.0.0.1:5432/override_db",
      dbUser: "override_user",
      dbPasswordMasked: "***",
      effectiveSource: "store-override",
      overrideActive: true,
      envSource: "/res/.env",
      envCandidates: ["/res/.env"],
    })
  })

  it("defaults to postgres when missing DB_TYPE", () => {
    const result = buildDbConfigView({
      env: {},
      envInfo: { candidates: [], active: undefined },
    })

    expect(result.dbType).toBe("postgres")
  })
})
