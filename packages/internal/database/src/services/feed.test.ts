import { describe, expect, it } from "vitest"
import { FeedService } from "./feed"

describe("FeedService", () => {
  it("should have refreshAll method", () => {
    expect((FeedService as any).refreshAll).toBeDefined()
  })
})
