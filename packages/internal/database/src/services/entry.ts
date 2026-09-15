import { and, asc, between, count, eq, exists, gt, inArray, isNull, lt, or } from "drizzle-orm"

import { db } from "../db"
import { entriesTable, feedsTable, subscriptionsTable } from "../schemas"
import { getRuntimeDbType } from "../schemas/runtime"
import type { EntrySchema } from "../schemas/types"
import { debugStartupReadTrace } from "../startup-read-trace"
import type { Resetable } from "./internal/base"
import { conflictUpdateAllExcept } from "./internal/utils"

const entryJsonColumns = [
  "media",
  "categories",
  "attachments",
  "extra",
  "sources",
  "settings",
] as const

type EntryJsonColumn = (typeof entryJsonColumns)[number]

/**
 * 两个方言对 JSON 列的期望不同：
 *  - postgres `jsonb` 接受 JSON **字符串**，故这里预先 stringify
 *  - sqlite `text({mode:"json"})` 由 drizzle 自己 stringify，若这里再 stringify
 *    就会双重编码，读回来是一个 JSON 字符串而不是对象
 */
const toJsonColumnValue = (value: unknown) => {
  if (value === null || value === undefined) return null

  if (getRuntimeDbType() === "sqlite") {
    if (typeof value !== "string") return value
    if (!value) return null
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  if (typeof value === "string") {
    if (!value) return null
    try {
      JSON.parse(value)
      return value
    } catch {
      return null
    }
  }
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export const sanitizeEntryJsonFields = <T extends Partial<EntrySchema>>(entry: T): T => {
  const sanitized = { ...entry }
  for (const column of entryJsonColumns) {
    if (!(column in sanitized)) continue
    const value = sanitized[column as EntryJsonColumn]
    if (value === undefined) continue
    ;(sanitized as Record<EntryJsonColumn, unknown>)[column] = toJsonColumnValue(value)
  }
  return sanitized
}

interface PublishAtTimeRangeFilter {
  startTime: number
  endTime: number
}

interface InsertedBeforeTimeRangeFilter {
  insertedBefore: number
}

// Unsubscribing retains articles for recovery, but they are outside local search.
const activeSearchEntry = () =>
  and(
    isNull(entriesTable.deletedAt),
    exists(
      db
        .select({ id: subscriptionsTable.id })
        .from(subscriptionsTable)
        .innerJoin(feedsTable, eq(feedsTable.id, subscriptionsTable.feedId))
        .where(
          and(
            eq(subscriptionsTable.feedId, entriesTable.feedId),
            eq(subscriptionsTable.type, "feed"),
            isNull(subscriptionsTable.deletedAt),
            isNull(feedsTable.deletedAt),
          ),
        ),
    ),
  )

class EntryServiceStatic implements Resetable {
  async purgeAllForMaintenance() {
    await db.delete(entriesTable).execute()
  }

  async reset() {
    await this.purgeAllForMaintenance()
  }

  async upsertMany(entries: EntrySchema[]) {
    if (entries.length === 0) return
    await db
      .insert(entriesTable)
      .values(entries.map((entry) => sanitizeEntryJsonFields(entry)))
      .onConflictDoUpdate({
        target: [entriesTable.id],
        set: conflictUpdateAllExcept(entriesTable, ["id"]),
      })
  }

  async patch(entry: Partial<EntrySchema> & { id: string }) {
    await db
      .update(entriesTable)
      .set(sanitizeEntryJsonFields(entry))
      .where(and(eq(entriesTable.id, entry.id), isNull(entriesTable.deletedAt)))
  }

  async patchMany({
    entry,
    entryIds,
    feedIds,
    time,
  }: {
    entry: Partial<EntrySchema>
    entryIds?: string[]
    feedIds?: string[]
    time?: PublishAtTimeRangeFilter | InsertedBeforeTimeRangeFilter
  }) {
    if (!entryIds && !feedIds) return
    if (entry.read !== undefined) {
      debugStartupReadTrace("[startup-read-trace] EntryService.patchMany(read)", () => ({
        read: entry.read,
        entryIds: entryIds?.slice(0, 20) ?? [],
        entryIdsCount: entryIds?.length ?? 0,
        feedIds: feedIds?.slice(0, 20) ?? [],
        feedIdsCount: feedIds?.length ?? 0,
        time: time ?? null,
      }))
    }
    await db
      .update(entriesTable)
      .set(sanitizeEntryJsonFields(entry))
      .where(
        and(
          or(inArray(entriesTable.id, entryIds ?? []), inArray(entriesTable.feedId, feedIds ?? [])),
          isNull(entriesTable.deletedAt),
          time && "startTime" in time
            ? between(entriesTable.publishedAt, time.startTime, time.endTime)
            : undefined,
          time && "insertedBefore" in time
            ? lt(entriesTable.insertedAt, time.insertedBefore)
            : undefined,
        ),
      )
  }

  getEntryMany(entryId: string[]) {
    return db.query.entriesTable.findMany({
      where: and(inArray(entriesTable.id, entryId), isNull(entriesTable.deletedAt)),
    })
  }

  getEntryAll() {
    return db.query.entriesTable.findMany({
      where: isNull(entriesTable.deletedAt),
    })
  }

  async getSearchCount() {
    const [row] = await db.select({ count: count() }).from(entriesTable).where(activeSearchEntry())
    return row?.count ?? 0
  }

  getSearchPage(afterId?: string) {
    // Keyset pagination bounds IPC payloads and annotation IN lists; never
    // hydrate media, cached readability bodies or other unused detail fields.
    return db
      .select({
        id: entriesTable.id,
        feedId: entriesTable.feedId,
        title: entriesTable.title,
        content: entriesTable.content,
        description: entriesTable.description,
      })
      .from(entriesTable)
      .where(and(activeSearchEntry(), afterId ? gt(entriesTable.id, afterId) : undefined))
      .orderBy(asc(entriesTable.id))
      .limit(200)
  }

  async deleteMany(entryIds: string[]) {
    if (entryIds.length === 0) return
    await db
      .update(entriesTable)
      .set({ deletedAt: Date.now() })
      .where(and(inArray(entriesTable.id, entryIds), isNull(entriesTable.deletedAt)))
  }
}

export const EntryService = new EntryServiceStatic()
