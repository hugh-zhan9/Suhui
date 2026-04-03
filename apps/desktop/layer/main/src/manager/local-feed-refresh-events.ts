import { BrowserWindow } from "electron"

type BatchRefreshResult = {
  refreshed?: number
  failed?: number
  results?: Array<{
    feedId?: string
    ok?: boolean
  }>
}

type LocalFeedRefreshSource = "manual-batch" | "startup-auto" | "interval-auto"

export const LOCAL_FEED_REFRESH_COMPLETED_CHANNEL = "local-feed-refresh-completed"

export const collectSuccessfulLocalRefreshFeedIds = (result?: BatchRefreshResult) => {
  if (!result?.results?.length) return []

  return Array.from(
    new Set(
      result.results
        .filter((item) => item?.ok && typeof item.feedId === "string" && !!item.feedId)
        .map((item) => item.feedId as string),
    ),
  )
}

export const broadcastLocalFeedRefreshCompleted = ({
  source,
  result,
}: {
  source: LocalFeedRefreshSource
  result?: BatchRefreshResult
}) => {
  const feedIds = collectSuccessfulLocalRefreshFeedIds(result)
  if (feedIds.length === 0) return

  const payload = {
    source,
    refreshed: result?.refreshed ?? 0,
    failed: result?.failed ?? 0,
    feedIds,
  }

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(LOCAL_FEED_REFRESH_COMPLETED_CHANNEL, payload)
  }
}
