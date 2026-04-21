import { db } from "../db"
import { unreadTable } from "../schemas"
import { inArray } from "drizzle-orm"
import type { UnreadSchema } from "../schemas/types"
import type { Resetable } from "./internal/base"
import { conflictUpdateAllExcept } from "./internal/utils"

interface UnreadUpdateOptions {
  reset?: boolean
}

class UnreadServiceStatic implements Resetable {
  async purgeAllForMaintenance() {
    await db.delete(unreadTable).execute()
  }

  async reset() {
    await this.purgeAllForMaintenance()
  }

  async getUnreadAll() {
    return db.query.unreadTable.findMany()
  }

  async upsertMany(unreads: UnreadSchema[], options?: UnreadUpdateOptions) {
    if (unreads.length === 0) return
    if (options?.reset) {
      await this.purgeAllForMaintenance()
    }
    await db
      .insert(unreadTable)
      .values(unreads)
      .onConflictDoUpdate({
        target: [unreadTable.id],
        set: conflictUpdateAllExcept(unreadTable, ["id"]),
      })
  }

  async purgeByIdsForMaintenance(ids: string[]) {
    if (!ids || ids.length === 0) return
    await db.delete(unreadTable).where(inArray(unreadTable.id, ids)).execute()
  }
}

export const UnreadService = new UnreadServiceStatic()
