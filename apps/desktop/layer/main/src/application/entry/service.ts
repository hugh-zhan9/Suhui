import { EntryService } from "@suhui/database/services/entry"

import { syncLogger } from "~/manager/sync-logger"

import { entryQueryService } from "./query-service"

export class EntryApplicationService {
  async getEntry(entryId: string) {
    return entryQueryService.getDetail(entryId, "desktop-non-deleted")
  }

  async listEntries(options?: { feedId?: string; unreadOnly?: boolean }) {
    const page = await entryQueryService.list({
      scope: options?.feedId ? { kind: "feeds", feedIds: [options.feedId] } : { kind: "timeline" },
      ...(options?.unreadOnly ? { read: false } : {}),
    })
    return page.items
  }

  async updateReadStatus(payload: { entryIds: string[]; read: boolean }) {
    const { entryIds, read } = payload
    if (!entryIds || entryIds.length === 0) return

    await EntryService.patchMany({
      entry: { read },
      entryIds,
    })
    for (const entryId of entryIds) {
      syncLogger.record({
        type: read ? "entry.mark_read" : "entry.mark_unread",
        entityType: "entry",
        entityId: entryId,
      })
    }
  }
}

export const entryApplicationService = new EntryApplicationService()
