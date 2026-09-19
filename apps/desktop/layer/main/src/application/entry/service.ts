import { EntryService } from "@suhui/database/services/entry"
import { readability } from "@suhui/readability"

import { syncLogger } from "~/manager/sync-logger"

import { entryQueryService } from "./query-service"

export class EntryApplicationService {
  async getEntry(entryId: string) {
    return entryQueryService.getDetail(entryId, "desktop-non-deleted")
  }

  /**
   * Extracted article body for an entry, fetching it once and keeping it.
   *
   * The desktop reads the same `readabilityContent` column, so whichever side
   * asks first pays for the fetch and both get the result afterwards. The URL
   * comes from the stored entry rather than the caller, so this cannot be used
   * to make the app fetch an arbitrary address.
   */
  async ensureReadabilityContent(entryId: string) {
    const entry = await entryQueryService.getDetail(entryId, "desktop-non-deleted")
    if (!entry) return null
    if (entry.readabilityContent) return entry.readabilityContent

    const url = entry.url
    if (!url || !/^https?:\/\//i.test(url)) return null

    const parsed = await readability(url)
    const content = parsed?.content
    if (!content) return null

    await EntryService.patchMany({ entry: { readabilityContent: content }, entryIds: [entryId] })
    return content
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
