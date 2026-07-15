import {
  entryChangeInvalidationCoordinator,
  type EntryChangeInvalidationCoordinator,
} from "@suhui/store/entry/change-invalidation"

type HandleEntryChange = EntryChangeInvalidationCoordinator["handle"]

export const syncLocalFeedRefreshCompleted = ({
  payload,
  handleChange = entryChangeInvalidationCoordinator.handle,
}: {
  payload?: unknown
  handleChange?: HandleEntryChange
}) => handleChange(payload, "ipc")
