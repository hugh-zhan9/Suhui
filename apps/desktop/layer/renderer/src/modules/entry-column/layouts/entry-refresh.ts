import { shouldTreatFeedAsRemoteBiz } from "@suhui/store/feed/local-feed"

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
  return !shouldTreatFeedAsRemoteBiz({ id: feedId, feed: feed as any })
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
  await ipc.invoke("db.refreshFeed", feedId)
  await fetchEntries({ feedId })
}
