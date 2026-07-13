import type { EntryModel } from "@suhui/store/entry/types"
import { transformVideoUrl } from "@suhui/utils/url-for-video"

export type VisibleDetailPrefetchRow = Pick<
  EntryModel,
  "id" | "url" | "attachments" | "media" | "description" | "recordKind"
>

export const isVideoSummarySufficient = (row: VisibleDetailPrefetchRow) => {
  if (row.recordKind === "detail") return true
  if (row.media?.[0]?.url) return true
  return Boolean(
    transformVideoUrl({
      url: row.url || "",
      mini: true,
      attachments: row.attachments,
    }),
  )
}

export const createVisibleDetailPrefetchQueue = ({
  concurrency,
  loadDetail,
}: {
  concurrency: 4
  loadDetail: (entryId: string, signal?: AbortSignal) => Promise<unknown>
}) => {
  if (concurrency !== 4) throw new Error("visible detail prefetch concurrency must be 4")

  const visibleRows = new Map<string, VisibleDetailPrefetchRow>()
  const queuedIds: string[] = []
  const active = new Map<string, AbortController>()
  const completedIds = new Set<string>()
  let observedMax = 0

  const drain = () => {
    while (active.size < concurrency && queuedIds.length > 0) {
      const entryId = queuedIds.shift()!
      const row = visibleRows.get(entryId)
      if (!row || completedIds.has(entryId) || active.has(entryId)) continue

      const controller = new AbortController()
      active.set(entryId, controller)
      observedMax = Math.max(observedMax, active.size)
      void Promise.resolve(loadDetail(entryId, controller.signal))
        .then(() => {
          if (!controller.signal.aborted) completedIds.add(entryId)
        })
        .catch(() => {})
        .finally(() => {
          active.delete(entryId)
          drain()
        })
    }
  }

  return {
    syncVisibleRows(rows: VisibleDetailPrefetchRow[]) {
      const nextVisibleRows = new Map(
        rows.filter((row) => !isVideoSummarySufficient(row)).map((row) => [row.id, row]),
      )
      visibleRows.clear()
      nextVisibleRows.forEach((row, entryId) => visibleRows.set(entryId, row))

      for (let index = queuedIds.length - 1; index >= 0; index -= 1) {
        if (!visibleRows.has(queuedIds[index]!)) queuedIds.splice(index, 1)
      }
      active.forEach((controller, entryId) => {
        if (!visibleRows.has(entryId)) controller.abort()
      })
      visibleRows.forEach((_row, entryId) => {
        if (completedIds.has(entryId) || active.has(entryId) || queuedIds.includes(entryId)) return
        queuedIds.push(entryId)
      })
      drain()
    },
    maxObservedConcurrency: () => observedMax,
    dispose() {
      queuedIds.splice(0)
      visibleRows.clear()
      active.forEach((controller) => controller.abort())
    },
  }
}

export const createVisibleDetailPrefetchRegistry = (queue: {
  syncVisibleRows: (rows: VisibleDetailPrefetchRow[]) => void
}) => {
  const rows = new Map<string, VisibleDetailPrefetchRow>()
  const sync = () => queue.syncVisibleRows(Array.from(rows.values()))
  return {
    register(row: VisibleDetailPrefetchRow) {
      rows.set(row.id, row)
      sync()
      return () => {
        rows.delete(row.id)
        sync()
      }
    },
  }
}

const visibleVideoDetailQueue = createVisibleDetailPrefetchQueue({
  concurrency: 4,
  loadDetail: async (entryId) => {
    const { entrySyncServices } = await import("@suhui/store/entry/store")
    await entrySyncServices.fetchEntryDetail(entryId)
  },
})
const visibleVideoDetailRegistry = createVisibleDetailPrefetchRegistry(visibleVideoDetailQueue)

export const registerVisibleVideoDetailPrefetchRow = (row: VisibleDetailPrefetchRow) =>
  visibleVideoDetailRegistry.register(row)
