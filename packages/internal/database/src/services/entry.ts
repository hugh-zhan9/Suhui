import { and, between, eq, inArray, isNull, lt, or } from "drizzle-orm"

import { db } from "../db"
import { entriesTable } from "../schemas"
import type { EntrySchema } from "../schemas/types"
import type { Resetable } from "./internal/base"
import {
  getActiveVisibilityState,
  isEntryVisibleForActiveRelations,
} from "./internal/active-visibility"
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

const toPgJsonbValue = (value: unknown) => {
  if (value === null || value === undefined) return null
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
    ;(sanitized as Record<EntryJsonColumn, unknown>)[column] = toPgJsonbValue(value)
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
      console.info("[startup-read-trace] EntryService.patchMany(read)", {
        read: entry.read,
        entryIds: entryIds?.slice(0, 20) ?? [],
        entryIdsCount: entryIds?.length ?? 0,
        feedIds: feedIds?.slice(0, 20) ?? [],
        feedIdsCount: feedIds?.length ?? 0,
        time: time ?? null,
      })
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

  async getEntriesToHydrate() {
    const entries = await db.query.entriesTable.findMany({
      where: isNull(entriesTable.deletedAt),
      orderBy: (t, { desc }) => desc(t.publishedAt),
    })
    const visibility = await getActiveVisibilityState()
    return entries.filter((entry) => isEntryVisibleForActiveRelations(entry, visibility))
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
