import { and, eq, isNull } from "drizzle-orm"
import { EntryService } from "@suhui/database/services/entry"
import {
  getActiveVisibilityState,
  isEntryVisibleForActiveRelations,
} from "@suhui/database/services/internal/active-visibility"

import { DBManager } from "~/manager/db"

export class EntryApplicationService {
  async getEntry(entryId: string) {
    const db = DBManager.getDB()
    const entry =
      (await db.query.entriesTable.findFirst({
        where: (entries) => and(eq(entries.id, entryId), isNull(entries.deletedAt)),
      })) ?? null
    if (!entry) return null
    const visibility = await getActiveVisibilityState()
    return isEntryVisibleForActiveRelations(entry, visibility) ? entry : null
  }

  async listEntries(options?: { feedId?: string; unreadOnly?: boolean }) {
    const db = DBManager.getDB()
    const feedId = options?.feedId
    const unreadOnly = options?.unreadOnly ?? false

    if (feedId) {
      const entries = await db.query.entriesTable.findMany({
        where: (entries) =>
          and(
            eq(entries.feedId, feedId),
            isNull(entries.deletedAt),
            unreadOnly ? eq(entries.read, false) : undefined,
          ),
        orderBy: (entries, { desc }) => [desc(entries.publishedAt), desc(entries.insertedAt)],
      })
      const visibility = await getActiveVisibilityState()
      return entries.filter((entry) => isEntryVisibleForActiveRelations(entry, visibility))
    }

    const entries = await db.query.entriesTable.findMany({
      where: unreadOnly
        ? (entries) => and(eq(entries.read, false), isNull(entries.deletedAt))
        : (entries) => isNull(entries.deletedAt),
      orderBy: (entries, { desc }) => [desc(entries.publishedAt), desc(entries.insertedAt)],
    })
    const visibility = await getActiveVisibilityState()
    return entries.filter((entry) => isEntryVisibleForActiveRelations(entry, visibility))
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
