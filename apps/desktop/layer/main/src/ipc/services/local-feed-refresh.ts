export const localFeedRefreshRequestTimeoutMs = 30_000
export const localFeedRefreshBatchConcurrency = 8
/**
 * Discovery probes several guessed urls, so each one gets a shorter budget than
 * the feed request the user actually asked for.
 */
export const feedDiscoveryCandidateTimeoutMs = 8_000
/** Candidates are guesses, so they get far less redirect rope than a real feed. */
export const feedDiscoveryCandidateMaxRedirects = 3
/**
 * `FeedViewType.Articles`. Every previewed feed — parsed, discovered or scraped
 * — pre-selects the same view, so a scraped source reads exactly like any other
 * subscription instead of landing in the wide social-media layout.
 */
export const defaultPreviewFeedView = 0

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
