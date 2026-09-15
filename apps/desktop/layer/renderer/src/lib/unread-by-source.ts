type EntrySourceState = { data: Record<string, number> }

export const countUnreadBySourceId = (state: EntrySourceState, id: string) => state.data[id] ?? 0

export const countUnreadBySourceIds = (state: EntrySourceState, ids: string[]) =>
  [...new Set(ids)].reduce((sum, id) => sum + countUnreadBySourceId(state, id), 0)

export const sortSourceIdsByUnread = (state: EntrySourceState, ids: string[], isDesc?: boolean) => {
  const next = ids.concat()
  next.sort((a, b) => {
    const unreadCompare = countUnreadBySourceId(state, b) - countUnreadBySourceId(state, a)
    if (unreadCompare !== 0) return isDesc ? unreadCompare : -unreadCompare
    return a.localeCompare(b)
  })
  return next
}
