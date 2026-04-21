import { and, eq, isNull } from "drizzle-orm"

import { db } from "../db"
import { inboxesTable } from "../schemas"
import type { InboxSchema } from "../schemas/types"
import type { Resetable } from "./internal/base"
import { conflictUpdateAllExcept } from "./internal/utils"

class InboxServiceStatic implements Resetable {
  async purgeAllForMaintenance() {
    await db.delete(inboxesTable).execute()
  }

  async reset() {
    await this.purgeAllForMaintenance()
  }

  async deleteById(id: string) {
    await db
      .update(inboxesTable)
      .set({ deletedAt: Date.now() })
      .where(and(eq(inboxesTable.id, id), isNull(inboxesTable.deletedAt)))
      .execute()
  }

  getInboxAll() {
    return db.query.inboxesTable.findMany({
      where: isNull(inboxesTable.deletedAt),
    })
  }

  async upsertMany(inboxes: InboxSchema[]) {
    if (inboxes.length === 0) return
    await db
      .insert(inboxesTable)
      .values(inboxes)
      .onConflictDoUpdate({
        target: [inboxesTable.id],
        set: conflictUpdateAllExcept(inboxesTable, ["id"]),
      })
  }
}

export const InboxService = new InboxServiceStatic()
