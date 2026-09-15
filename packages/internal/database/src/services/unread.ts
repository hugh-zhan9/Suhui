import { db } from "../db"
import { entriesTable, unreadTable } from "../schemas"
import { getActiveVisibilityState } from "./internal/active-visibility"
import { getRuntimeDbType } from "../schemas/runtime"
import { and, count, countDistinct, inArray, isNull, sql } from "drizzle-orm"
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
    const visibility = await getActiveVisibilityState()
    const sourceId = sql<string>`COALESCE(${entriesTable.inboxHandle}, ${entriesTable.feedId})`
    const rows = await db
      .select({ id: sourceId, count: count() })
      .from(entriesTable)
      .where(and(isNull(entriesTable.deletedAt), sql`${entriesTable.read} IS NOT TRUE`))
      .groupBy(sourceId)
    const counts = new Map(
      [...visibility.activeFeedIds, ...visibility.activeInboxIds, ...visibility.activeListIds].map(
        (id) => [id, 0],
      ),
    )
    for (const row of rows) if (counts.has(row.id)) counts.set(row.id, row.count)
    // List membership is stored in entry.sources; evaluate it only when lists exist.
    if (visibility.activeListIds.size) {
      const membership =
        getRuntimeDbType() === "sqlite"
          ? sql`json_each(${entriesTable.sources})`
          : sql`jsonb_array_elements_text(${entriesTable.sources})`
      const listId = sql<string>`membership.value`
      const listCounts = await db
        .select({ id: listId, count: countDistinct(entriesTable.id) })
        .from(entriesTable)
        .innerJoin(
          getRuntimeDbType() === "sqlite"
            ? sql`${membership} AS membership`
            : sql`${membership} AS membership(value)`,
          sql`true`,
        )
        .where(
          and(
            isNull(entriesTable.deletedAt),
            sql`${entriesTable.read} IS NOT TRUE`,
            inArray(listId, [...visibility.activeListIds]),
          ),
        )
        .groupBy(listId)
      for (const row of listCounts) counts.set(row.id, row.count)
    }
    return [...counts].map(([id, count]) => ({ id, count }))
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
