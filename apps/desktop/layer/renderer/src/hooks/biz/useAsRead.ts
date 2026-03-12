import { useEntry } from "@suhui/store/entry/hooks"
import type { EntryModel } from "@suhui/store/entry/types"
import { useIsLoggedIn } from "@suhui/store/user/hooks"

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
