type IpcInvoker = {
  invoke: (channel: string, ...args: any[]) => Promise<unknown>
}

type FetchEntries = (args: { feedId: string }) => Promise<unknown>

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

export const refreshAllLocalFeedsAndSyncEntries = async ({ ipc }: { ipc: IpcInvoker }) => {
  const result = (await ipc.invoke("db.refreshLocalSubscribedFeeds", {
    source: "manual-batch",
  })) as { refreshed?: number; failed?: number } | undefined
  return result
}
