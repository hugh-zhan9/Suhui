import { randomUUID } from "node:crypto"

import { EntryAnnotationService } from "@suhui/database/services/entry-annotation"
import { EntryService } from "@suhui/database/services/entry"
import type { EntryHighlightSchema } from "@suhui/database/schemas/types"

import { DBManager } from "~/manager/db"

import { articleText, createHighlightAnchor, relocateHighlightAnchor } from "./anchor"

export class AnnotationApplicationService {
  async list(entryId: string) {
    const [notes, highlights] = await Promise.all([
      EntryAnnotationService.getNotes([entryId]),
      EntryAnnotationService.getHighlights([entryId]),
    ])
    return { notes, highlights }
  }

  async createNote(entryId: string, content: string) {
    return DBManager.runTrackedOperation(() => this.createNoteUnlocked(entryId, content))
  }

  private async createNoteUnlocked(entryId: string, content: string) {
    await this.getEntry(entryId)
    const normalized = content.trim()
    if (!normalized) throw new Error("Note content is empty")
    const now = Date.now()
    const note = {
      id: randomUUID(),
      entryId,
      content: normalized,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await EntryAnnotationService.upsertNote(note)
    return note
  }

  async updateNote(id: string, content: string, expectedUpdatedAt: number) {
    return DBManager.runTrackedOperation(() =>
      this.updateNoteUnlocked(id, content, expectedUpdatedAt),
    )
  }

  private async updateNoteUnlocked(id: string, content: string, expectedUpdatedAt: number) {
    const current = await EntryAnnotationService.getNote(id)
    if (!current) throw new Error("Note not found")
    if (current.updatedAt !== expectedUpdatedAt) throw new Error("Note was changed by another edit")
    const normalized = content.trim()
    if (!normalized) throw new Error("Note content is empty")
    const note = { ...current, content: normalized, updatedAt: Date.now() }
    await EntryAnnotationService.upsertNote(note)
    return note
  }

  deleteNote(id: string) {
    return DBManager.runTrackedOperation(() => EntryAnnotationService.deleteNote(id, Date.now()))
  }

  async createHighlight(input: {
    entryId: string
    source: "rss" | "readability"
    quote: string
    prefix?: string
    suffix?: string
    startOffset?: number | null
    endOffset?: number | null
  }) {
    return DBManager.runTrackedOperation(() => this.createHighlightUnlocked(input))
  }

  private async createHighlightUnlocked(input: {
    entryId: string
    source: "rss" | "readability"
    quote: string
    prefix?: string
    suffix?: string
    startOffset?: number | null
    endOffset?: number | null
  }) {
    const entry = await this.getEntry(input.entryId)
    const text = this.getSourceText(entry, input.source)
    const anchor = createHighlightAnchor(text, input)
    const now = Date.now()
    const highlight = {
      id: randomUUID(),
      entryId: input.entryId,
      source: input.source,
      ...anchor,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await EntryAnnotationService.upsertHighlight(highlight)
    return highlight
  }

  deleteHighlight(id: string) {
    return DBManager.runTrackedOperation(() =>
      EntryAnnotationService.deleteHighlight(id, Date.now()),
    )
  }

  async relocate(entryId: string) {
    return DBManager.runTrackedOperation(() => this.relocateUnlocked(entryId))
  }

  private async relocateUnlocked(entryId: string) {
    const entry = await this.getEntry(entryId)
    const highlights = await EntryAnnotationService.getHighlights([entryId])
    const relocated: EntryHighlightSchema[] = []
    for (const highlight of highlights) {
      const text = this.getSourceTextOrNull(entry, highlight.source)
      const next = text
        ? relocateHighlightAnchor(text, highlight)
        : { ...highlight, startOffset: null, endOffset: null, status: "orphaned" as const }
      const updated = { ...highlight, ...next, updatedAt: Date.now() }
      await EntryAnnotationService.upsertHighlight(updated)
      relocated.push(updated)
    }
    return relocated
  }

  private async getEntry(entryId: string) {
    const [entry] = await EntryService.getEntryMany([entryId])
    if (!entry) throw new Error("Entry not found")
    return entry
  }

  private getSourceText(
    entry: Awaited<ReturnType<typeof EntryService.getEntryMany>>[number],
    source: "rss" | "readability",
  ) {
    const html = source === "readability" ? entry.readabilityContent : entry.content
    if (!html) throw new Error(`Entry ${source} content is empty`)
    return articleText(html)
  }

  private getSourceTextOrNull(
    entry: Awaited<ReturnType<typeof EntryService.getEntryMany>>[number],
    source: "rss" | "readability",
  ) {
    const html = source === "readability" ? entry.readabilityContent : entry.content
    return html ? articleText(html) : null
  }
}

export const annotationApplicationService = new AnnotationApplicationService()
