type IpcInvoker = {
  invoke: (channel: string, ...args: any[]) => Promise<unknown>
}

type FetchEntries = (args: { feedId: string }) => Promise<unknown>

type BatchRefreshResult = {
  refreshed?: number
  failed?: number
  results?: Array<{
    feedId?: string
    ok?: boolean
  }>
}

export const shouldUseLocalFeedRefresh = ({
  feedId,
  feed,
}: {
  feedId?: string
  feed?: { type?: string | null; url?: string | null; ownerUserId?: string | null } | null
}) => {
  if (!feedId || feed?.type !== "feed" || !feed.url) return false
  return true
}

export const shouldUseBatchLocalRefresh = ({
  feedId,
  isAllFeeds,
  feed,
}: {
  feedId?: string
  isAllFeeds: boolean
  feed?: { type?: string | null; url?: string | null; ownerUserId?: string | null } | null
}) => {
  if (isAllFeeds) return true
  if (!feedId) return true
  return !feed
}

export const refreshLocalFeedAndSyncEntries = async ({
  feedId,
  ipc,
  fetchEntries,
}: {
  feedId: string
  ipc: IpcInvoker
  fetchEntries: FetchEntries
}) => {
  await ipc.invoke("db.refreshFeed", feedId, { source: "manual-single" })
  await fetchEntries({ feedId })
}

export const extractSuccessfulLocalRefreshFeedIds = (result?: BatchRefreshResult) => {
  if (!result?.results?.length) return []

  return Array.from(
    new Set(
      result.results
        .filter((item) => item?.ok && typeof item.feedId === "string" && !!item.feedId)
        .map((item) => item.feedId as string),
    ),
  )
}

export const syncSuccessfulLocalRefreshFeeds = async ({
  result,
  fetchEntries,
}: {
  result?: BatchRefreshResult
  fetchEntries: FetchEntries
}) => {
  const feedIds = extractSuccessfulLocalRefreshFeedIds(result)
  if (feedIds.length === 0) return

  await Promise.all(feedIds.map((feedId) => fetchEntries({ feedId })))
}

export const refreshAllLocalFeedsAndSyncEntries = async ({
  ipc,
  fetchEntries,
}: {
  ipc: IpcInvoker
  fetchEntries?: FetchEntries
}) => {
  const result = (await ipc.invoke("db.refreshLocalSubscribedFeeds", {
    source: "manual-batch",
  })) as BatchRefreshResult | undefined

  if (fetchEntries) {
    await syncSuccessfulLocalRefreshFeeds({
      result,
      fetchEntries,
    })
  }

  return result
}
