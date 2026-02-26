type EntryLike = {
  id: string
  read?: boolean | null
}

type EntrySourceState = {
  data: Record<string, EntryLike>
  entryIdByFeed: Record<string, Set<string>>
  entryIdByInbox: Record<string, Set<string>>
  entryIdByList: Record<string, Set<string>>
}

const countUnreadByEntryIds = (state: EntrySourceState, entryIds?: Set<string>) => {
  if (!entryIds || entryIds.size === 0) return 0
  let unread = 0
  for (const id of entryIds) {
    if (!state.data[id]?.read) unread++
  }
  return unread
}

const getSourceEntryIds = (state: EntrySourceState, id: string) =>
  state.entryIdByFeed[id] || state.entryIdByInbox[id] || state.entryIdByList[id]

export const countUnreadBySourceId = (state: EntrySourceState, id: string) =>
  countUnreadByEntryIds(state, getSourceEntryIds(state, id))

export const countUnreadBySourceIds = (state: EntrySourceState, ids: string[]) => {
  let unread = 0
  for (const id of ids) {
    unread += countUnreadBySourceId(state, id)
  }
  return unread
}

export const sortSourceIdsByUnread = (
  state: EntrySourceState,
  ids: string[],
  isDesc?: boolean,
) => {
  const next = ids.concat()
  next.sort((a, b) => {
    const unreadCompare = countUnreadBySourceId(state, b) - countUnreadBySourceId(state, a)
    if (unreadCompare !== 0) return isDesc ? unreadCompare : -unreadCompare
    return a.localeCompare(b)
  })
  return next
}

