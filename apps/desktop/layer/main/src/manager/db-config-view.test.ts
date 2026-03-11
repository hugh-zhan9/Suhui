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
      envSource: "/user/.env",
      envCandidates: ["/res/.env", "/user/.env"],
    })
  })

  it("defaults to sqlite when missing DB_TYPE", () => {
    const result = buildDbConfigView({
      env: {},
      envInfo: { candidates: [], active: undefined },
    })

    expect(result.dbType).toBe("sqlite")
  })
})
