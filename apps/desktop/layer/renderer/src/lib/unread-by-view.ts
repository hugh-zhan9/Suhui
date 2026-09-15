import type { FeedViewType } from "@suhui/constants"
import { getSubscribedFeedIdAndInboxHandlesByView } from "@suhui/store/subscription/getter"

type EntryViewState = { data: Record<string, number> }

export const countUnreadByView = (state: EntryViewState, view: FeedViewType) => {
  const sourceIds = getSubscribedFeedIdAndInboxHandlesByView({
    view,
    excludePrivate: true,
    excludeHidden: true,
  })
  return [...new Set(sourceIds)].reduce((sum, id) => sum + (state.data[id] ?? 0), 0)
}
