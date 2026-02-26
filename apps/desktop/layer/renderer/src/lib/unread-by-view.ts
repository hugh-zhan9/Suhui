import type { FeedViewType } from "@follow/constants"
import type { EntryModel } from "@follow/store/entry/types"
import { getSubscribedFeedIdAndInboxHandlesByView } from "@follow/store/subscription/getter"

type EntryViewState = {
  data: Record<string, EntryModel>
  entryIdByFeed: Record<string, Set<string>>
  entryIdByInbox: Record<string, Set<string>>
}

export const countUnreadByView = (state: EntryViewState, view: FeedViewType) => {
  const sourceIds = getSubscribedFeedIdAndInboxHandlesByView({
    view,
    excludePrivate: true,
    excludeHidden: true,
  })
  const seen = new Set<string>()
  let unread = 0

  for (const sourceId of sourceIds) {
    const entryIds = state.entryIdByFeed[sourceId] ?? state.entryIdByInbox[sourceId] ?? new Set()
    for (const id of entryIds) {
      if (seen.has(id)) continue
      seen.add(id)
      if (!state.data[id]?.read) {
        unread++
      }
    }
  }

  return unread
}
