import { beforeEach, describe, expect, it, vi } from "vitest"

const { processDedup, processRules } = vi.hoisted(() => ({
  processDedup: vi.fn(),
  processRules: vi.fn(),
}))

vi.mock("../dedup/service", () => ({
  dedupApplicationService: { processEntries: processDedup },
}))
vi.mock("../rules/service", () => ({
  ruleApplicationService: { processNewEntries: processRules },
}))
vi.mock("~/logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("~/manager/db", () => ({
  DBManager: { runTrackedOperation: (operation: () => Promise<unknown>) => operation() },
}))

import { LocalReadingPipeline } from "./pipeline"

describe("LocalReadingPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    processDedup.mockResolvedValue({ clustered: 1 })
    processRules.mockResolvedValue({ applied: 1 })
  })

  it("deduplicates entry ids before derived processing", async () => {
    await new LocalReadingPipeline().processNewEntries(["entry-1", "entry-1", "entry-2"])
    expect(processDedup).toHaveBeenCalledWith(["entry-1", "entry-2"])
    expect(processRules).toHaveBeenCalledWith(["entry-1", "entry-2"])
  })

  it("does not fail persisted entry refresh when derived work fails", async () => {
    processDedup.mockRejectedValue(new Error("dedup failed"))
    await expect(new LocalReadingPipeline().processNewEntries(["entry-1"])).resolves.toEqual({
      dedup: null,
      rules: { applied: 1 },
    })
  })
})
