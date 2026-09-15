import { normalizeRssTitleForRender } from "../../lib/rss-content-normalize"
import { SEARCH_RESULT_LIMIT } from "./constants"

export interface SearchDocument {
  id: string
  feedId: string | null
  title: string | null
  content: string | null
  description: string | null
  localNotes: string[]
  localHighlights: string[]
  localTags: string[]
}

export type SearchScope = "all" | "title"
export type MatchRange = readonly [number, number] // End is exclusive.
export type SearchField = "content" | "description" | "note" | "highlight" | "tag"
export type EntrySearchItem = Pick<SearchDocument, "id" | "feedId" | "title"> & {
  titleMatches?: MatchRange[]
  snippet?: { field: SearchField; text: string; matches: MatchRange[] }
}

const matchPattern = (query: string) =>
  new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu")
export const findMatches = (text: string, query: string): MatchRange[] => {
  if (!query) return []
  const pattern = matchPattern(query)
  return Array.from(
    text.matchAll(pattern),
    (match) => [match.index!, match.index! + match[0].length] as const,
  )
}

// Produce plain text in the worker. Results are React text, never executable HTML.
const plainText = (html: string) =>
  normalizeRssTitleForRender(
    html
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, " ")
      .replace(/<\/?(?:p|div|br|li|h[1-6]|tr|section|article|blockquote)\b[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim()

const snippetFor = (field: SearchField, text: string, query: string) => {
  const first = matchPattern(query).exec(text)
  if (!first) return undefined
  const start = Math.max(0, first.index - 60)
  const end = Math.min(text.length, first.index + first[0].length + 100)
  const snippet = `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`
  return { field, text: snippet, matches: findMatches(snippet, query) }
}

// This index only runs in the search worker. Only bounded excerpts return to the UI.
export class EntrySearchIndex {
  private readonly documents: {
    item: EntrySearchItem
    titleLower: string
    fields: { field: SearchField; text: string; lower: string }[]
  }[] = []

  add(documents: SearchDocument[]) {
    for (const document of documents) {
      const item = {
        id: document.id,
        feedId: document.feedId,
        title: normalizeRssTitleForRender(document.title),
      }
      const fields: { field: SearchField; text: string }[] = [
        { field: "content", text: plainText(document.content || "") },
        { field: "description", text: plainText(document.description || "") },
        ...document.localNotes.map((text) => ({ field: "note" as const, text })),
        ...document.localHighlights.map((text) => ({ field: "highlight" as const, text })),
        ...document.localTags.map((text) => ({ field: "tag" as const, text })),
      ]
      this.documents.push({
        item,
        titleLower: item.title.toLowerCase(),
        fields: fields
          .filter(({ text }) => !!text)
          .map((field) => ({ ...field, lower: field.text.toLowerCase() })),
      })
    }
  }

  search(keyword: string, scope: SearchScope = "all", activeFeedIds?: string[]): EntrySearchItem[] {
    const query = keyword.trim().toLowerCase()
    if (!query) return []
    const active = activeFeedIds && new Set(activeFeedIds)
    const visible = (item: EntrySearchItem) => !active || (!!item.feedId && active.has(item.feedId))
    const result: EntrySearchItem[] = []
    // Native substring matching keeps full-body searches linear.
    for (const document of this.documents) {
      if (!visible(document.item)) continue
      const titleMatch = document.titleLower.includes(query)
      const field =
        scope === "all" ? document.fields.find(({ lower }) => lower.includes(query)) : undefined
      if (titleMatch || field)
        result.push({
          ...document.item,
          titleMatches: findMatches(document.item.title || "", keyword.trim()),
          ...(field ? { snippet: snippetFor(field.field, field.text, keyword.trim()) } : {}),
        })
      if (result.length === SEARCH_RESULT_LIMIT) return result
    }
    return result
  }
}

export type SearchWorkerRequest = { id: number } & (
  | { type: "add"; documents: SearchDocument[] }
  | { type: "search"; keyword: string; scope?: SearchScope; activeFeedIds?: string[] }
)
export type SearchWorkerResponse = { id: number; items?: EntrySearchItem[]; error?: string }
