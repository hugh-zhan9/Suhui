import { useEntry } from "@follow/store/entry/hooks"
import { useState } from "react"

import { EntryTitle } from "../EntryTitle"
import { ContentBody } from "./shared"
import type { EntryLayoutProps } from "./types"

export const VideosLayout: React.FC<EntryLayoutProps> = ({
  entryId,
  compact = false,
  noMedia = false,
  translation,
}) => {
  const entry = useEntry(entryId, (state) => state)

  if (!entry) return null

  return (
    <div className="mx-auto flex h-full flex-col p-6">
      {/* Content area below video */}
      <div className="flex-1 space-y-4">
        {/* Title */}
        <EntryTitle entryId={entryId} compact={compact} />

        {/* Description/Content or Transcript */}
        <ContentBody
          entryId={entryId}
          translation={translation}
          compact={compact}
          noMedia={true}
          className="text-base"
        />
      </div>
    </div>
  )
}
