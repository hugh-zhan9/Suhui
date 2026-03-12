import { describe, expect, it } from "vitest"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getRuntimeDbType } = require("@suhui/database/schemas/runtime") as {
  getRuntimeDbType: () => "postgres"
}

describe("schema runtime", () => {
  it("defaults to postgres", () => {
    delete (globalThis as any).__followDbType
    expect(getRuntimeDbType()).toBe("postgres")
  })

  it("uses postgres when global set", () => {
    ;(globalThis as any).__followDbType = "postgres"
    expect(getRuntimeDbType()).toBe("postgres")
  })

  it("ignores sqlite override", () => {
    ;(globalThis as any).__followDbType = "sqlite"
    expect(getRuntimeDbType()).toBe("postgres")
  })
})
