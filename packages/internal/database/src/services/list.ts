import { and, eq, isNull } from "drizzle-orm"

import { db } from "../db"
import { listsTable } from "../schemas"
import type { ListSchema } from "../schemas/types"
import type { Resetable } from "./internal/base"
import { conflictUpdateAllExcept } from "./internal/utils"

class ListServiceStatic implements Resetable {
  async purgeAllForMaintenance() {
    await db.delete(listsTable).execute()
  }

  async reset() {
    await this.purgeAllForMaintenance()
  }

  async upsertMany(lists: ListSchema[]) {
    if (lists.length === 0) return
    await db
      .insert(listsTable)
      .values(lists)
      .onConflictDoUpdate({
        target: [listsTable.id],
        set: conflictUpdateAllExcept(listsTable, ["id"]),
      })
  }

  async deleteList(listId: string) {
    await db
      .update(listsTable)
      .set({ deletedAt: Date.now() })
      .where(and(eq(listsTable.id, listId), isNull(listsTable.deletedAt)))
  }

  getListAll() {
    return db.query.listsTable.findMany({
      where: isNull(listsTable.deletedAt),
    })
  }
}

export const ListService = new ListServiceStatic()
