import { describe, expect, it } from "vitest"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getRuntimeDbType } = require("@suhui/database/schemas/runtime") as {
  getRuntimeDbType: () => "sqlite" | "postgres"
}

describe("schema runtime", () => {
  it("defaults to sqlite", () => {
    delete (globalThis as any).__followDbType
    expect(getRuntimeDbType()).toBe("sqlite")
  })

  it("uses postgres when global set", () => {
    ;(globalThis as any).__followDbType = "postgres"
    expect(getRuntimeDbType()).toBe("postgres")
  })
})
