import { eq, inArray } from "drizzle-orm"

import { db } from "../db"
import { collectionsTable } from "../schemas"
import type { CollectionSchema } from "../schemas/types"
import type { Resetable } from "./internal/base"
import { conflictUpdateAllExcept } from "./internal/utils"
import { recordSyncOp } from "./internal/sync-proxy"

class CollectionServiceStatic implements Resetable {
  async reset() {
    await db.delete(collectionsTable).execute()
  }

  async upsertMany(collections: CollectionSchema[], options?: { reset?: boolean }) {
    if (collections.length === 0) return

    if (options?.reset) {
      await db.delete(collectionsTable).execute()
    }

    await db
      .insert(collectionsTable)
      .values(collections)
      .onConflictDoUpdate({
        target: [collectionsTable.entryId],
        set: conflictUpdateAllExcept(collectionsTable, ["entryId"]),
      })

    collections.forEach(c => recordSyncOp("collection.add", "collection", c.entryId, c))
  }

  async delete(entryId: string) {
    await db.delete(collectionsTable).where(eq(collectionsTable.entryId, entryId))
    recordSyncOp("collection.remove", "collection", entryId)
  }

  async deleteMany(entryId: string[]) {
    if (entryId.length === 0) return
    await db.delete(collectionsTable).where(inArray(collectionsTable.entryId, entryId))
    entryId.forEach(id => recordSyncOp("collection.remove", "collection", id))
  }

  getCollectionMany(entryId: string[]) {
    return db.query.collectionsTable.findMany({ where: inArray(collectionsTable.entryId, entryId) })
  }

  getCollectionAll() {
    return db.query.collectionsTable.findMany()
  }
}

export const CollectionService = new CollectionServiceStatic()
