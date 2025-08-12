import type { FeedViewType } from "@follow/constants"
import { views } from "@follow/constants"
import { cn } from "@follow/utils/utils"
import { memo } from "react"

import { EntryReadHistory } from "../../entry-read-history"

interface EntryHeaderReadHistoryProps {
  entryId: string
  view: FeedViewType
  shouldShow: boolean
  shouldHide: boolean
}

function EntryHeaderReadHistoryImpl({
  entryId,
  view,
  shouldShow,
  shouldHide,
}: EntryHeaderReadHistoryProps) {
  if (!shouldShow) return null

  return (
    <div
      className={cn(
        "zen-mode-macos:left-12 text-body absolute left-5 top-0 flex h-full items-center gap-2 leading-none",
        "visible z-[11]",
        views[view]?.wideMode && "static",
        shouldHide && "hidden",
      )}
    >
      <EntryReadHistory entryId={entryId} />
    </div>
  )
}

export const EntryHeaderReadHistory = memo(EntryHeaderReadHistoryImpl)
