type IpcInvoker = {
  invoke: (channel: string, ...args: any[]) => Promise<unknown>
}

type FetchEntries = (args: { feedId: string }) => Promise<unknown>

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
