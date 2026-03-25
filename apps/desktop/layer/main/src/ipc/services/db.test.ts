import { describe, expect, it } from "vitest"
import { DbService } from "./db"

describe("DbService refreshAll", () => {
  it("should have refreshAll method", () => {
    const service = new DbService({} as any)
    expect(service.refreshAll).toBeDefined()
  })
})
