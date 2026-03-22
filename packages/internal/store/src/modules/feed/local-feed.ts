import { isBizId } from "@suhui/utils"

import type { FeedModel } from "./types"

export const shouldTreatFeedAsRemoteBiz = ({
  id,
  feed,
}: {
  id?: string
  feed?: Pick<FeedModel, "url" | "ownerUserId"> | null
}) => {
  if (!id || !isBizId(id)) return false

  // Imported/local feeds may carry numeric IDs that look like biz snowflakes.
  // If a persisted local feed row exists and has no owner, keep it on the local path.
  if (feed?.url && !feed.ownerUserId) {
    return false
  }

  return true
}
