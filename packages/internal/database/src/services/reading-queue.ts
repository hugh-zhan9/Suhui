import { and, count, desc, eq, gte } from "drizzle-orm"

import { db } from "../db"
import { readingQueueTable } from "../schemas"
import type { ReadingQueueSchema } from "../schemas/types"

class ReadingQueueServiceStatic {
  get(entryId: string) {
    return db.query.readingQueueTable.findFirst({ where: eq(readingQueueTable.entryId, entryId) })
  }

  async upsert(item: ReadingQueueSchema) {
    await db
      .insert(readingQueueTable)
      .values(item)
      .onConflictDoUpdate({
        target: readingQueueTable.entryId,
        set: {
          status: item.status,
          addedAt: item.addedAt,
          completedAt: item.completedAt,
          updatedAt: item.updatedAt,
        },
      })
  }

  async remove(entryId: string) {
    await db.delete(readingQueueTable).where(eq(readingQueueTable.entryId, entryId))
  }

  list(status: "pending" | "completed", limit = 100) {
    return db.query.readingQueueTable.findMany({
      where: eq(readingQueueTable.status, status),
      orderBy:
        status === "pending"
          ? desc(readingQueueTable.addedAt)
          : desc(readingQueueTable.completedAt),
      limit,
    })
  }

  completedSince(since: number) {
    return db.query.readingQueueTable.findMany({
      where: gte(readingQueueTable.completedAt, since),
      columns: { entryId: true, completedAt: true },
    })
  }

  async countByStatus(status: "pending" | "completed", since?: number) {
    const [result] = await db
      .select({ count: count() })
      .from(readingQueueTable)
      .where(
        and(
          eq(readingQueueTable.status, status),
          status === "completed" && since !== undefined
            ? gte(readingQueueTable.completedAt, since)
            : undefined,
        ),
      )
    return result?.count ?? 0
  }
}

export const ReadingQueueService = new ReadingQueueServiceStatic()
