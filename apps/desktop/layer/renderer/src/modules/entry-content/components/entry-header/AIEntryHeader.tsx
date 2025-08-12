import { memo } from "react"

import { BaseEntryHeader } from "./internal/BaseEntryHeader"
import type { EntryHeaderProps } from "./types"

function EntryHeaderImpl({ view, entryId, className, compact }: EntryHeaderProps) {
  return (
    <BaseEntryHeader
      view={view}
      entryId={entryId}
      className={className}
      compact={compact}
      config={{ alwaysShowActions: true }}
    />
  )
}

export const AIEntryHeader = memo(EntryHeaderImpl)
