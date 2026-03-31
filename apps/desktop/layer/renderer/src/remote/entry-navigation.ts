type EntryLike = {
  id: string
}

export const getPreferredEntryIdAfterReadChange = ({
  entries,
  activeEntryId,
  changedEntryId,
  nextRead,
  unreadOnly,
}: {
  entries: EntryLike[]
  activeEntryId: string | null
  changedEntryId: string
  nextRead: boolean
  unreadOnly: boolean
}) => {
  if (!activeEntryId) return null
  if (activeEntryId !== changedEntryId) return activeEntryId
  if (!unreadOnly || !nextRead) return activeEntryId

  const currentIndex = entries.findIndex((entry) => entry.id === changedEntryId)
  if (currentIndex === -1) return activeEntryId

  return entries[currentIndex + 1]?.id || entries[currentIndex - 1]?.id || null
}
