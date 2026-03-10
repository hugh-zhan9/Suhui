import { describe, expect, it } from "vitest"

import { buildPgConfig } from "./db-config"

describe("db manager", () => {
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
    })
  })
})
