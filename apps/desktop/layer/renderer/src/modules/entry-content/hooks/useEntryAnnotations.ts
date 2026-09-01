import { runtimeClient } from "@suhui/store/runtime"
import { useCallback, useSyncExternalStore } from "react"

export type EntryNote = { id: string; content: string; updatedAt: number }

export type EntryHighlight = {
  id: string
  quote: string
  prefix: string
  suffix: string
  source: "rss" | "readability"
  status: "active" | "orphaned"
}

export type EntryAnnotations = { notes: EntryNote[]; highlights: EntryHighlight[] }

const EMPTY_ANNOTATIONS: EntryAnnotations = { notes: [], highlights: [] }

/**
 * Notes and highlights are read by both the article body (which paints highlights over
 * the rendered text) and the annotations panel (which edits them), so the fetched
 * snapshot lives in one store instead of in each component.
 */
const snapshots = new Map<string, EntryAnnotations>()
const listeners = new Map<string, Set<() => void>>()

const subscribe = (entryId: string, listener: () => void) => {
  const entryListeners = listeners.get(entryId) ?? new Set<() => void>()
  listeners.set(entryId, entryListeners)
  entryListeners.add(listener)

  return () => {
    entryListeners.delete(listener)
    if (entryListeners.size === 0) listeners.delete(entryId)
  }
}

export const refreshEntryAnnotations = async (entryId: string) => {
  const value = (await runtimeClient.annotations.list(entryId)) as EntryAnnotations | null
  snapshots.set(entryId, {
    notes: value?.notes ?? [],
    highlights: value?.highlights ?? [],
  })
  for (const listener of listeners.get(entryId) ?? []) listener()
}

export const useEntryAnnotations = (entryId: string) => {
  const getSnapshot = useCallback(() => snapshots.get(entryId) ?? EMPTY_ANNOTATIONS, [entryId])

  return useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(entryId, listener), [entryId]),
    getSnapshot,
    getSnapshot,
  )
}
