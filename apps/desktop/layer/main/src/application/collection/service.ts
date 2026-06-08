import { CollectionService } from "@suhui/database/services/collection"

import { entryApplicationService } from "~/application/entry/service"

export type UpdateEntryStarPayload = {
  entryId: string
  starred: boolean
  view: number
}

export class CollectionApplicationService {
  async listCollections() {
    return CollectionService.getCollectionAll()
  }

  async updateEntryStar(payload: UpdateEntryStarPayload) {
    const entry = await entryApplicationService.getEntry(payload.entryId)
    if (!entry) {
      throw new Error("REMOTE_ENTRY_NOT_FOUND")
    }

    if (!payload.starred) {
      await CollectionService.delete(payload.entryId)
      return
    }

    await CollectionService.upsertMany([
      {
        createdAt: new Date().toISOString(),
        entryId: payload.entryId,
        feedId: entry.feedId,
        view: payload.view as any,
      },
    ])
  }
}

export const collectionApplicationService = new CollectionApplicationService()
