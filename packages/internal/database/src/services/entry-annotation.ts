import { and, eq, inArray, isNull } from "drizzle-orm"

import { db } from "../db"
import { entryHighlightsTable, entryNotesTable } from "../schemas"
import type { EntryHighlightSchema, EntryNoteSchema } from "../schemas/types"

class EntryAnnotationServiceStatic {
  getNote(id: string) {
    return db.query.entryNotesTable.findFirst({
      where: and(eq(entryNotesTable.id, id), isNull(entryNotesTable.deletedAt)),
    })
  }

  getHighlight(id: string) {
    return db.query.entryHighlightsTable.findFirst({
      where: and(eq(entryHighlightsTable.id, id), isNull(entryHighlightsTable.deletedAt)),
    })
  }

  async upsertNote(note: EntryNoteSchema) {
    await db
      .insert(entryNotesTable)
      .values(note)
      .onConflictDoUpdate({
        target: entryNotesTable.id,
        set: { content: note.content, updatedAt: note.updatedAt, deletedAt: note.deletedAt },
      })
  }

  async upsertHighlight(highlight: EntryHighlightSchema) {
    await db
      .insert(entryHighlightsTable)
      .values(highlight)
      .onConflictDoUpdate({
        target: entryHighlightsTable.id,
        set: {
          quote: highlight.quote,
          prefix: highlight.prefix,
          suffix: highlight.suffix,
          startOffset: highlight.startOffset,
          endOffset: highlight.endOffset,
          status: highlight.status,
          updatedAt: highlight.updatedAt,
          deletedAt: highlight.deletedAt,
        },
      })
  }

  getNotes(entryIds: string[]) {
    if (entryIds.length === 0) return Promise.resolve([])
    return db.query.entryNotesTable.findMany({
      where: and(inArray(entryNotesTable.entryId, entryIds), isNull(entryNotesTable.deletedAt)),
    })
  }

  getHighlights(entryIds: string[]) {
    if (entryIds.length === 0) return Promise.resolve([])
    return db.query.entryHighlightsTable.findMany({
      where: and(
        inArray(entryHighlightsTable.entryId, entryIds),
        isNull(entryHighlightsTable.deletedAt),
      ),
    })
  }

  async deleteNote(id: string, deletedAt: number) {
    await db
      .update(entryNotesTable)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(entryNotesTable.id, id))
  }

  async deleteHighlight(id: string, deletedAt: number) {
    await db
      .update(entryHighlightsTable)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(entryHighlightsTable.id, id))
  }
}

export const EntryAnnotationService = new EntryAnnotationServiceStatic()
