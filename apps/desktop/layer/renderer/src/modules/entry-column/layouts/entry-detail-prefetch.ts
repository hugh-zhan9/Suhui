type PrefetchIntent = "focus" | "pointer" | "programmatic"

type EntryDetailPrefetchOptions = {
  entryId: string
  isDetailLoaded: (entryId: string) => boolean
  fetchDetail: (entryId: string) => Promise<unknown>
  delayMs?: number
}

export const createEntryDetailPrefetch = ({
  entryId,
  isDetailLoaded,
  fetchDetail,
  delayMs = 120,
}: EntryDetailPrefetchOptions) => {
  const intents = new Set<PrefetchIntent>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const cancelTimer = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  return {
    schedule(intent: PrefetchIntent = "programmatic") {
      intents.add(intent)
      if (timer !== undefined || isDetailLoaded(entryId)) return
      timer = setTimeout(() => {
        timer = undefined
        if (intents.size === 0 || isDetailLoaded(entryId)) return
        void fetchDetail(entryId).catch(() => undefined)
      }, delayMs)
    },
    cancel(intent: PrefetchIntent = "programmatic") {
      intents.delete(intent)
      if (intents.size === 0) cancelTimer()
    },
    dispose() {
      intents.clear()
      cancelTimer()
    },
  }
}
