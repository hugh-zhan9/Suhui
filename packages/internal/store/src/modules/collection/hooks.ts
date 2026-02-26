import type { FeedViewType } from "@follow/constants"
import type { CollectionSchema } from "@follow/database/schemas/types"
import { useCallback } from "react"

import { useCollectionStore } from "./store"

export const useCollectionEntry = (entryId: string) => {
  return useCollectionStore(
    useCallback(
      (state) => {
        return state.collections[entryId]
      },
      [entryId],
    ),
  )
}

export const useIsEntryStarred = (entryId: string) => {
  return useCollectionStore(
    useCallback(
      (state) => {
        return !!state.collections[entryId]
      },
      [entryId],
    ),
  )
}

export const getCollectionEntryIds = (
  collections: Record<string, CollectionSchema>,
  _view: FeedViewType,
) => {
  return Object.values(collections)
    .sort((a, b) => (new Date(a.createdAt ?? 0) > new Date(b.createdAt ?? 0) ? -1 : 1))
    .map((item) => item.entryId)
}

export const useCollectionEntryList = (view: FeedViewType) => {
  return useCollectionStore(
    useCallback(
      (state) => {
        return getCollectionEntryIds(state.collections, view)
      },
      [view],
    ),
  )
}
