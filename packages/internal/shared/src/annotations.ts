export type AnnotationKind = "note" | "highlight"

export type AnnotationLibraryCursor = {
  updatedAt: number
  id: string
  kind: AnnotationKind
}

export type AnnotationLibraryQuery = {
  kind?: AnnotationKind
  cursor?: AnnotationLibraryCursor
  limit?: number
}

export type AnnotationLibraryItem = AnnotationLibraryCursor & {
  entryId: string
  content: string
  source: "rss" | "readability" | null
  status: "active" | "orphaned" | null
  articleId: string | null
  articleTitle: string | null
  feedId: string | null
  feedTitle: string | null
}

export type AnnotationLibraryPage = {
  items: AnnotationLibraryItem[]
  nextCursor: AnnotationLibraryCursor | null
}
