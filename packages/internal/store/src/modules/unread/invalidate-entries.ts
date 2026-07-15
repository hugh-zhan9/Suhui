import { createEntryChangeEventV1 } from "@suhui/shared/entry-change"

import { entryChangeInvalidationCoordinator } from "../entry/change-invalidation"

let fallbackBatchSequence = 0

const createUnreadMutationBatchId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  fallbackBatchSequence++
  return `unread-${Date.now()}-${fallbackBatchSequence}`
}

export const invalidateEntriesForUnreadMutation = async (entryIds: string[]) => {
  const changeSet = createEntryChangeEventV1({
    batchId: createUnreadMutationBatchId(),
    reason: "read",
    source: "unread-mutation",
    scope: "all",
    feedIds: [],
    entryIds,
    completedAt: Date.now(),
  })

  return entryChangeInvalidationCoordinator.handle(changeSet, "response")
}
