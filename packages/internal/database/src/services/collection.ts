import { and, eq, inArray, isNull } from "drizzle-orm"

import { db } from "../db"
import { collectionsTable } from "../schemas"
import type { CollectionSchema } from "../schemas/types"
import type { Resetable } from "./internal/base"
import { conflictUpdateAllExcept } from "./internal/utils"
import { recordSyncOp } from "./internal/sync-proxy"

class CollectionServiceStatic implements Resetable {
  async purgeAllForMaintenance() {
    await db.delete(collectionsTable).execute()
  }

  async reset() {
    await this.purgeAllForMaintenance()
  }

  async upsertMany(collections: CollectionSchema[], options?: { reset?: boolean }) {
    if (collections.length === 0) return

    if (options?.reset) {
      await this.purgeAllForMaintenance()
    }

    await db
      .insert(collectionsTable)
      .values(collections)
      .onConflictDoUpdate({
        target: [collectionsTable.entryId],
        set: conflictUpdateAllExcept(collectionsTable, ["entryId"]),
      })

    collections.forEach((c) => recordSyncOp("collection.add", "collection", c.entryId, c))
  }

  async delete(entryId: string) {
    await db
      .update(collectionsTable)
      .set({ deletedAt: Date.now() })
      .where(and(eq(collectionsTable.entryId, entryId), isNull(collectionsTable.deletedAt)))
    recordSyncOp("collection.remove", "collection", entryId)
  }

  async deleteMany(entryId: string[]) {
    if (entryId.length === 0) return
    await db
      .update(collectionsTable)
      .set({ deletedAt: Date.now() })
      .where(and(inArray(collectionsTable.entryId, entryId), isNull(collectionsTable.deletedAt)))
    entryId.forEach((id) => recordSyncOp("collection.remove", "collection", id))
  }

  getCollectionMany(entryId: string[]) {
    return db.query.collectionsTable.findMany({
      where: and(inArray(collectionsTable.entryId, entryId), isNull(collectionsTable.deletedAt)),
    })
  }

  getCollectionAll() {
    return db.query.collectionsTable.findMany({
      where: isNull(collectionsTable.deletedAt),
    })
  }
}

export const CollectionService = new CollectionServiceStatic()
