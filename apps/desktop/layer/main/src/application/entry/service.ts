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
}

export const entryApplicationService = new EntryApplicationService()
