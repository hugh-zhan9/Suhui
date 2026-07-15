import { BrowserWindow } from "electron"

import { parseEntryChangeEventV1 } from "@suhui/shared/entry-change"

type BatchRefreshResult = {
  refreshed?: number
  failed?: number
  results?: Array<{
    feedId?: string
    ok?: boolean
  }>
}

export const LOCAL_FEED_REFRESH_COMPLETED_CHANNEL = "local-feed-refresh-completed"

export const collectSuccessfulLocalRefreshFeedIds = (result?: BatchRefreshResult) => {
  if (!result?.results?.length) return []

  const seen = new Set<string>()
  const feedIds: string[] = []
  for (const item of result.results) {
    if (!item?.ok || typeof item.feedId !== "string") continue
    const feedId = item.feedId.trim()
    if (!feedId || seen.has(feedId)) continue
    seen.add(feedId)
    feedIds.push(feedId)
  }
  return feedIds
}

export const broadcastLocalFeedRefreshCompleted = (input: unknown) => {
  const payload = parseEntryChangeEventV1(input)
  if (!payload || payload.reason !== "refresh" || payload.feedIds.length === 0) return 0

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(LOCAL_FEED_REFRESH_COMPLETED_CHANNEL, payload)
  }
  return 1
}
