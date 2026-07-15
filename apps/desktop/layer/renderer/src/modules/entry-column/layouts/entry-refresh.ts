import type { EntryChangeResponse } from "@suhui/shared/entry-change"
import {
  entryChangeInvalidationCoordinator,
  type EntryChangeInvalidationCoordinator,
} from "@suhui/store/entry/change-invalidation"

type IpcInvoker = {
  invoke: (channel: string, ...args: any[]) => Promise<unknown>
}

type HandleEntryChange = EntryChangeInvalidationCoordinator["handle"]

type SingleRefreshResult = {
  feed?: unknown
  entriesCount?: number
}

type BatchRefreshResult = {
  total?: number
  refreshed?: number
  failed?: number
  results?: Array<{
    feedId?: string
    ok?: boolean
    entriesCount?: number
    error?: string
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
  handleChange = entryChangeInvalidationCoordinator.handle,
}: {
  feedId: string
  ipc: IpcInvoker
  handleChange?: HandleEntryChange
}) => {
  const result = (await ipc.invoke("db.refreshFeed", feedId, {
    source: "manual-single",
  })) as EntryChangeResponse<SingleRefreshResult>

  const handleResult = await handleChange(result.changeSet, "response")
  if (handleResult === "ignored-invalid") throw new TypeError("Invalid refresh ChangeSet")
  return result
}

export const refreshAllLocalFeedsAndSyncEntries = async ({
  ipc,
  handleChange = entryChangeInvalidationCoordinator.handle,
}: {
  ipc: IpcInvoker
  handleChange?: HandleEntryChange
}) => {
  const result = (await ipc.invoke("db.refreshLocalSubscribedFeeds", {
    source: "manual-batch",
  })) as EntryChangeResponse<BatchRefreshResult>

  const handleResult = await handleChange(result.changeSet, "response")
  if (handleResult === "ignored-invalid") throw new TypeError("Invalid refresh ChangeSet")
  return result
}
