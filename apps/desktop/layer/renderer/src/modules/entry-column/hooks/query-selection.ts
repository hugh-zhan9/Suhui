export const shouldUseLocalEntriesQuery = ({
  isCollection,
  remoteReady,
}: {
  isCollection: boolean
  remoteReady: boolean
}) => {
  if (isCollection) return true
  return !remoteReady
}

export const normalizePendingFeedId = (feedId: string | undefined, pendingFeedId: string) => {
  if (!feedId) return undefined
  if (feedId === pendingFeedId) return undefined
  return feedId
}

export const normalizeFeedIdForActiveSubscription = ({
  feedId,
  pendingFeedId,
  isSubscribed,
  allowUnsubscribedFeed,
}: {
  feedId: string | undefined
  pendingFeedId: string
  isSubscribed: boolean
  allowUnsubscribedFeed: boolean
}) => {
  const normalizedFeedId = normalizePendingFeedId(feedId, pendingFeedId)
  if (!normalizedFeedId) return undefined
  if (!isSubscribed && !allowUnsubscribedFeed) return undefined
  return normalizedFeedId
}

export const shouldFilterUnreadEntries = ({
  isCollection,
  unreadOnly,
}: {
  isCollection: boolean
  unreadOnly: boolean
}) => unreadOnly && !isCollection

export const shouldIncludeEntryInUnreadOnly = ({
  isCollection,
  unreadOnly,
  read,
  entryId,
  activeEntryId,
  pendingActiveEntryId,
}: {
  isCollection: boolean
  unreadOnly: boolean
  read: boolean
  entryId: string
  activeEntryId?: string
  pendingActiveEntryId?: string | null
}) => {
  if (!shouldFilterUnreadEntries({ isCollection, unreadOnly })) return true
  if (!read) return true
  return entryId === activeEntryId || entryId === pendingActiveEntryId
}

let pendingActiveEntryId: string | null = null

export const setPendingActiveEntryId = (entryId: string | null) => {
  pendingActiveEntryId = entryId
}

export const getPendingActiveEntryId = () => pendingActiveEntryId
