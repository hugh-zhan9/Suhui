import { useCallback, useRef, useState } from "react"

import { ipcServices } from "~/lib/client"

type HistoryState = {
  feedId?: string
  loading: boolean
  status: "more" | "complete" | "unsupported" | "limit"
  error: string | null
}
const initialState = (feedId?: string): HistoryState => ({
  feedId,
  loading: false,
  status: "more",
  error: null,
})

/** Lives above the virtual list, so scrolling an error offscreen cannot restart requests. */
export const useFeedHistory = (
  feedId: string | undefined,
  onLoaded: () => void | Promise<void>,
) => {
  const [storedState, setState] = useState(() => initialState(feedId))
  const state = storedState.feedId === feedId ? storedState : initialState(feedId)
  if (storedState.feedId !== feedId) setState(state)
  const current = useRef(state)
  current.current = state
  const generation = useRef({ feedId, value: 0 })
  if (generation.current.feedId !== feedId)
    generation.current = { feedId, value: generation.current.value + 1 }

  const loadMore = useCallback(
    async (retry = false) => {
      const active = current.current
      if (
        !feedId ||
        active.feedId !== feedId ||
        active.loading ||
        active.status !== "more" ||
        (active.error && !retry)
      )
        return
      const token = generation.current.value
      const update = (next: HistoryState) => {
        if (generation.current.value !== token || generation.current.feedId !== feedId) return
        current.current = next
        setState(next)
      }
      update({ ...active, loading: true, error: null })
      try {
        if (!ipcServices) throw new Error("历史补全仅在桌面应用中可用")
        const result = await ipcServices.db.loadFeedHistory(feedId)
        if (generation.current.value !== token || generation.current.feedId !== feedId) return
        // A previous batch can finish while this subscription is offscreen.
        await onLoaded()
        update({ feedId, loading: false, status: result.status, error: null })
      } catch (error) {
        update({
          ...active,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [feedId, onLoaded],
  )
  return { ...state, loadMore }
}
