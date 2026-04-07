export const localFeedRefreshRequestTimeoutMs = 30_000
export const localFeedRefreshBatchConcurrency = 8

export const isLocalFeedRefreshCandidate = ({
  url,
  ownerUserId: _ownerUserId,
}: {
  url?: string | null
  ownerUserId?: string | null
}) => {
  if (!url) return false
  return true
}
