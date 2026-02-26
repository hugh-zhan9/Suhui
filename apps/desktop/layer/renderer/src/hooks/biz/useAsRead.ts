import { useEntry } from "@follow/store/entry/hooks"
import type { EntryModel } from "@follow/store/entry/types"
import { useIsLoggedIn } from "@follow/store/user/hooks"

import { useRouteParamsSelector } from "./useRouteParams"

const selector = (state: EntryModel) => state.read
export function useEntryIsRead(entryId?: string) {
  const entryRead = useEntry(entryId, selector)

  return useRouteParamsSelector(
    (params) => {
      // In local mode (not logged in), still use the actual read state from the store
      if (params.isCollection) {
        return true
      }
      if (entryRead === undefined) return false
      return entryRead
    },
    [entryRead],
  )
}
