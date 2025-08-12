import type { FeedViewType } from "@follow/constants"
import { views } from "@follow/constants"
import { useHasEntry } from "@follow/store/entry/hooks"
import { cn } from "@follow/utils/utils"
import { memo } from "react"

import { useUISettingKey } from "~/atoms/settings/ui"

import { useEntryContentScrollToTop, useEntryTitleMeta } from "../../../atoms"
import { EntryHeaderActionsContainer } from "./EntryHeaderActionsContainer"
import { EntryHeaderMeta } from "./EntryHeaderMeta"
import { EntryHeaderReadHistory } from "./EntryHeaderReadHistory"

interface EntryHeaderConfig {
  showActionsWhenWide?: boolean
  alwaysShowActions?: boolean
}

interface BaseEntryHeaderProps {
  view: FeedViewType
  entryId: string
  className?: string
  compact?: boolean
  config?: EntryHeaderConfig
}

function BaseEntryHeaderImpl({ view, entryId, className, compact, config }: BaseEntryHeaderProps) {
  const hasEntry = useHasEntry(entryId)
  const entryTitleMeta = useEntryTitleMeta()
  const isAtTop = useEntryContentScrollToTop()
  const hideRecentReader = useUISettingKey("hideRecentReader")

  const shouldShowMeta = !isAtTop && !!entryTitleMeta?.title
  const isWide = views[view]?.wideMode

  const shouldShowActions =
    config?.alwaysShowActions ?? (config?.showActionsWhenWide ? true : !isWide)

  if (!hasEntry) return null

  return (
    <div
      data-hide-in-print
      className={cn(
        "zen-mode-macos:ml-margin-macos-traffic-light-x text-text-secondary relative flex min-w-0 items-center justify-between gap-3 overflow-hidden text-lg duration-200",
        shouldShowMeta && "border-border border-b",
        className,
      )}
    >
      <EntryHeaderReadHistory
        entryId={entryId}
        view={view}
        shouldShow={!hideRecentReader}
        shouldHide={shouldShowMeta}
      />

      <div
        className="relative z-10 flex w-full items-center justify-between gap-3"
        data-hide-in-print
      >
        <EntryHeaderMeta entryTitleMeta={entryTitleMeta} shouldShow={shouldShowMeta} />

        <EntryHeaderActionsContainer
          entryId={entryId}
          view={view}
          compact={compact}
          shouldShow={shouldShowActions}
        />
      </div>
    </div>
  )
}

export const BaseEntryHeader = memo(BaseEntryHeaderImpl)
