import { beforeEach, describe, expect, it, vi } from "vitest"

const { getEntryMany, getQueueItem, upsertQueueItem, runTrackedOperation } = vi.hoisted(() => ({
  getEntryMany: vi.fn(),
  getQueueItem: vi.fn(),
  upsertQueueItem: vi.fn(),
  runTrackedOperation: vi.fn((operation: () => Promise<unknown>) => operation()),
}))

vi.mock("@suhui/database/services/entry", () => ({ EntryService: { getEntryMany } }))
vi.mock("@suhui/database/services/reading-queue", () => ({
  ReadingQueueService: { get: getQueueItem, upsert: upsertQueueItem },
}))
vi.mock("~/manager/db", () => ({ DBManager: { runTrackedOperation } }))

import { completeQueueItem, requeue } from "../local-reading/domain"
import { ReadingQueueApplicationService } from "./service"

describe("reading queue state", () => {
  beforeEach(() => vi.clearAllMocks())

  it("stays independent and preserves explicit completion history", () => {
    const pending = requeue(null, 10)
    const completed = completeQueueItem(pending, 20)
    expect(completed).toEqual({
      status: "completed",
      addedAt: 10,
      completedAt: 20,
      updatedAt: 20,
    })
    expect(completeQueueItem(completed, 30).completedAt).toBe(20)
    expect(requeue(completed, 40)).toEqual({
      status: "pending",
      addedAt: 40,
      completedAt: null,
      updatedAt: 40,
    })
  })

  it("registers queue mutations with the maintenance barrier", async () => {
    getEntryMany.mockResolvedValue([{ id: "entry-1" }])
    getQueueItem.mockResolvedValue(null)

    await new ReadingQueueApplicationService().add("entry-1")

    expect(runTrackedOperation).toHaveBeenCalledOnce()
    expect(upsertQueueItem).toHaveBeenCalledOnce()
  })
})
