import { syncSuccessfulLocalRefreshFeeds } from "../modules/entry-column/layouts/entry-refresh"

type FetchEntries = (args: { feedId: string }) => Promise<unknown>

type LocalFeedRefreshCompletedPayload = {
  source?: string
  results?: Array<{
    feedId?: string
    ok?: boolean
  }>
}

export const shouldHandleBackgroundLocalFeedRefresh = (source?: string) =>
  source === "startup-auto" || source === "interval-auto"

export const syncLocalFeedRefreshCompleted = async ({
  payload,
  fetchEntries,
}: {
  payload?: LocalFeedRefreshCompletedPayload
  fetchEntries: FetchEntries
}) => {
  if (!shouldHandleBackgroundLocalFeedRefresh(payload?.source)) return

  await syncSuccessfulLocalRefreshFeeds({
    result: payload,
    fetchEntries,
  })
}
