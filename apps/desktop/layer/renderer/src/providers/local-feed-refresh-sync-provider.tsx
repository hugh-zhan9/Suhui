import type { EntryChangeEventV1 } from "@suhui/shared/entry-change"
import { useEffect, useRef } from "react"

import { syncLocalFeedRefreshCompleted } from "~/lib/local-feed-refresh-sync"

export const LocalFeedRefreshSyncProvider = () => {
  const syncQueueRef = useRef(Promise.resolve())

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer
    if (!ipc) return

    const dispose = ipc.on(
      "local-feed-refresh-completed",
      (_event, payload: EntryChangeEventV1) => {
        syncQueueRef.current = syncQueueRef.current
          .catch(() => {})
          .then(async () => {
            await syncLocalFeedRefreshCompleted({ payload })
          })
          .catch((error) => {
            console.warn("[LocalFeedRefreshSyncProvider] failed to sync background refresh", {
              batchId: payload?.batchId,
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
