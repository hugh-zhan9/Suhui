import type {
  AnnotationKind,
  AnnotationLibraryPage,
  AnnotationLibraryQuery,
} from "@suhui/shared/annotations"
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"

import { db } from "../db"
import { entriesTable, entryHighlightsTable, entryNotesTable, feedsTable } from "../schemas"
import type { EntryHighlightSchema, EntryNoteSchema } from "../schemas/types"

class EntryAnnotationServiceStatic {
  async listLibrary({
    kind,
    cursor,
    limit = 50,
  }: AnnotationLibraryQuery = {}): Promise<AnnotationLibraryPage> {
    const annotations = db
      .select({
        id: entryNotesTable.id,
        entryId: entryNotesTable.entryId,
        kind: sql<AnnotationKind>`'note'`.as("kind"),
        content: entryNotesTable.content,
        updatedAt: entryNotesTable.updatedAt,
        source: sql<"rss" | "readability" | null>`null`.as("source"),
        status: sql<"active" | "orphaned" | null>`null`.as("status"),
      })
      .from(entryNotesTable)
      .where(isNull(entryNotesTable.deletedAt))
      .unionAll(
        db
          .select({
            id: entryHighlightsTable.id,
            entryId: entryHighlightsTable.entryId,
            kind: sql<AnnotationKind>`'highlight'`.as("kind"),
            content: sql<string>`${entryHighlightsTable.quote}`.as("content"),
            updatedAt: entryHighlightsTable.updatedAt,
            source: entryHighlightsTable.source,
            status: entryHighlightsTable.status,
          })
          .from(entryHighlightsTable)
          .where(isNull(entryHighlightsTable.deletedAt)),
      )
      .as("annotations")

    // Keep saved annotations even if their article or subscription is no longer available.
    const rows = await db
      .select({
        id: annotations.id,
        entryId: annotations.entryId,
        kind: annotations.kind,
        content: annotations.content,
        updatedAt: annotations.updatedAt,
        source: annotations.source,
        status: annotations.status,
        articleId: entriesTable.id,
        articleTitle: entriesTable.title,
        feedId: entriesTable.feedId,
        feedTitle: feedsTable.title,
      })
      .from(annotations)
      .leftJoin(
        entriesTable,
        and(eq(entriesTable.id, annotations.entryId), isNull(entriesTable.deletedAt)),
      )
      .leftJoin(feedsTable, eq(feedsTable.id, entriesTable.feedId))
      .where(
        and(
          kind ? eq(annotations.kind, kind) : undefined,
          cursor
            ? or(
                lt(annotations.updatedAt, cursor.updatedAt),
                and(eq(annotations.updatedAt, cursor.updatedAt), lt(annotations.id, cursor.id)),
                and(
                  eq(annotations.updatedAt, cursor.updatedAt),
                  eq(annotations.id, cursor.id),
                  lt(annotations.kind, cursor.kind),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(annotations.updatedAt), desc(annotations.id), desc(annotations.kind))
      .limit(limit + 1)

    const items = rows.slice(0, limit)
    const last = items.at(-1)
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? { updatedAt: last.updatedAt, id: last.id, kind: last.kind }
          : null,
    }
  }

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
