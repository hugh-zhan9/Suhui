import { and, eq, isNull } from "drizzle-orm"

import { CollectionService } from "@suhui/database/services/collection"
import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"

import { DBManager } from "~/manager/db"

export type SuhuiExportPayload = {
  version: 1
  exportedAt: number
  feeds: unknown[]
  subscriptions: unknown[]
  collections: unknown[]
  readEntries: string[]
}

const isExportPayload = (value: unknown): value is SuhuiExportPayload => {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<SuhuiExportPayload>
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.feeds) &&
    Array.isArray(candidate.subscriptions) &&
    Array.isArray(candidate.collections) &&
    Array.isArray(candidate.readEntries)
  )
}

export class ImportExportApplicationService {
  async exportData(): Promise<SuhuiExportPayload> {
    const db = DBManager.getDB()
    const [feeds, subscriptions, collections, readEntriesRaw] = await Promise.all([
      FeedService.getFeedAll(),
      SubscriptionService.getSubscriptionAll(),
      CollectionService.getCollectionAll(),
      db.query.entriesTable.findMany({
        where: (entries) => and(eq(entries.read, true), isNull(entries.deletedAt)),
        columns: { id: true },
      }),
    ])

    return {
      version: 1,
      exportedAt: Date.now(),
      feeds,
      subscriptions,
      collections,
      readEntries: readEntriesRaw.map((entry) => entry.id),
    }
  }

  async importData(payload: unknown) {
    if (!isExportPayload(payload)) {
      throw new Error("Invalid Suhui export payload")
    }

    await FeedService.upsertMany(payload.feeds as any[])
    await SubscriptionService.upsertMany(payload.subscriptions as any[])
    await CollectionService.upsertMany(payload.collections as any[])

    if (payload.readEntries.length > 0) {
      const batchSize = 500
      for (let index = 0; index < payload.readEntries.length; index += batchSize) {
        const batch = payload.readEntries.slice(index, index + batchSize)
        await EntryService.patchMany({
          entryIds: batch,
          entry: { read: true } as any,
        })
      }
    }

    return {
      feeds: payload.feeds.length,
      subscriptions: payload.subscriptions.length,
      collections: payload.collections.length,
      readEntries: payload.readEntries.length,
    }
  }
}

export const importExportApplicationService = new ImportExportApplicationService()
