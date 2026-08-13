import { EntryService } from "@suhui/database/services/entry"
import { ReadingQueueService } from "@suhui/database/services/reading-queue"

import { DBManager } from "~/manager/db"

import { completeQueueItem, requeue } from "../local-reading/domain"

export class ReadingQueueApplicationService {
  async add(entryId: string) {
    return DBManager.runTrackedOperation(async () => {
      await this.assertEntry(entryId)
      const current = await ReadingQueueService.get(entryId)
      const state = requeue(current ?? null, Date.now())
      await ReadingQueueService.upsert({ entryId, ...state })
      return { entryId, ...state }
    })
  }

  async complete(entryId: string) {
    return DBManager.runTrackedOperation(async () => {
      const current = await ReadingQueueService.get(entryId)
      if (!current) throw new Error("Entry is not in the reading queue")
      const state = completeQueueItem(current, Date.now())
      await ReadingQueueService.upsert({ entryId, ...state })
      return { entryId, ...state }
    })
  }

  async remove(entryId: string) {
    await DBManager.runTrackedOperation(() => ReadingQueueService.remove(entryId))
  }

  async list(status: "pending" | "completed" = "pending", limit = 100) {
    const queue = await ReadingQueueService.list(status, Math.max(1, Math.min(limit, 500)))
    const entries = await EntryService.getEntryMany(queue.map((item) => item.entryId))
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
    return queue.map((item) => ({ ...item, entry: entriesById.get(item.entryId) ?? null }))
  }

  async stats(now = Date.now()) {
    const day = 24 * 60 * 60 * 1000
    const [pending, completed7Days, completed30Days] = await Promise.all([
      ReadingQueueService.countByStatus("pending"),
      ReadingQueueService.countByStatus("completed", now - 7 * day),
      ReadingQueueService.countByStatus("completed", now - 30 * day),
    ])
    return { pending, completed7Days, completed30Days }
  }

  private async assertEntry(entryId: string) {
    const [entry] = await EntryService.getEntryMany([entryId])
    if (!entry) throw new Error("Entry not found")
  }
}

export const readingQueueApplicationService = new ReadingQueueApplicationService()
