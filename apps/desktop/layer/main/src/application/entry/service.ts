import { EntryService } from "@suhui/database/services/entry"

import { DBManager } from "~/manager/db"

export class EntryApplicationService {
  async listEntries(feedId?: string) {
    const db = DBManager.getDB()

    if (feedId) {
      return db.query.entriesTable.findMany({
        where: (entries, { eq }) => eq(entries.feedId, feedId),
        orderBy: (entries, { desc }) => [desc(entries.publishedAt)],
      })
    }

    return db.query.entriesTable.findMany({
      orderBy: (entries, { desc }) => [desc(entries.publishedAt)],
    })
  }

  async updateReadStatus(payload: { entryIds: string[]; read: boolean }) {
    const { entryIds, read } = payload
    if (!entryIds || entryIds.length === 0) return

    await EntryService.patchMany({
      entry: { read },
      entryIds,
    })
  }
}

export const entryApplicationService = new EntryApplicationService()
