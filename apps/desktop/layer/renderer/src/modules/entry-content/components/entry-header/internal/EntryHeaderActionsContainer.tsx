import type { FeedViewType } from "@follow/constants"
import { memo } from "react"

import { EntryHeaderActions } from "../../../actions/header-actions"
import { MoreActions } from "../../../actions/more-actions"

interface EntryHeaderActionsContainerProps {
  entryId: string
  view: FeedViewType
  compact?: boolean
  shouldShow: boolean
}

function EntryHeaderActionsContainerImpl({
  entryId,
  view,
  compact,
  shouldShow,
}: EntryHeaderActionsContainerProps) {
  if (!shouldShow) return null

  return (
    <div className="relative flex shrink-0 items-center justify-end gap-2">
      <EntryHeaderActions entryId={entryId} view={view} compact={compact} />
      <MoreActions entryId={entryId} view={view} />
    </div>
  )
}

export const EntryHeaderActionsContainer = memo(EntryHeaderActionsContainerImpl)
