import { EntryService } from "@suhui/database/services/entry"

import { DBManager } from "~/manager/db"

export class EntryApplicationService {
  async getEntry(entryId: string) {
    const db = DBManager.getDB()
    return (
      db.query.entriesTable.findFirst({
        where: (entries, { eq }) => eq(entries.id, entryId),
      }) ?? null
    )
  }

  async listEntries(options?: { feedId?: string; unreadOnly?: boolean }) {
    const db = DBManager.getDB()
    const feedId = options?.feedId
    const unreadOnly = options?.unreadOnly ?? false

    if (feedId) {
      return db.query.entriesTable.findMany({
        where: (entries, { and, eq }) =>
          and(eq(entries.feedId, feedId), unreadOnly ? eq(entries.read, false) : undefined),
        orderBy: (entries, { desc }) => [desc(entries.publishedAt)],
      })
    }

    return db.query.entriesTable.findMany({
      where: unreadOnly ? (entries, { eq }) => eq(entries.read, false) : undefined,
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
