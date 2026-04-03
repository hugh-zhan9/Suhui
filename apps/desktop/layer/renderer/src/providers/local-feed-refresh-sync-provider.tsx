import { entrySyncServices } from "@suhui/store/entry/store"
import { useEffect, useRef } from "react"

import { syncLocalFeedRefreshCompleted } from "~/lib/local-feed-refresh-sync"

type LocalFeedRefreshCompletedPayload = {
  source?: string
  refreshed?: number
  failed?: number
  feedIds?: string[]
  results?: Array<{
    feedId?: string
    ok?: boolean
  }>
}

export const LocalFeedRefreshSyncProvider = () => {
  const syncQueueRef = useRef(Promise.resolve())

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return

    const dispose = ipc.on(
      "local-feed-refresh-completed",
      (_event, payload: LocalFeedRefreshCompletedPayload) => {
        syncQueueRef.current = syncQueueRef.current
          .catch(() => {})
          .then(() =>
            syncLocalFeedRefreshCompleted({
              payload: payload?.results
                ? payload
                : {
                    ...payload,
                    results: payload?.feedIds?.map((feedId) => ({ feedId, ok: true })),
                  },
              fetchEntries: entrySyncServices.fetchEntries.bind(entrySyncServices),
            }),
          )
          .catch((error) => {
            console.warn("[LocalFeedRefreshSyncProvider] failed to sync background refresh", {
              reason: error instanceof Error ? error.message : String(error),
              source: payload?.source,
            })
          })
      },
    )

    return () => {
      dispose()
    }
  }, [])

  return null
}
