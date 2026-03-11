import { describe, expect, it } from "vitest"

import { getRuntimeDbType } from "../../../../../../packages/internal/database/src/schemas/runtime"

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
