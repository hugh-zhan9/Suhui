type EntryLike = {
  id: string
  read?: boolean | null
  publishedAt?: number | null
}

export type EntrySortMode = "newest" | "oldest" | "unread-first"

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

export const sortEntries = <T extends EntryLike>(entries: T[], mode: EntrySortMode) => {
  const nextEntries = [...entries]

  if (mode === "oldest") {
    return nextEntries.sort((a, b) => (a.publishedAt || 0) - (b.publishedAt || 0))
  }

  if (mode === "unread-first") {
    return nextEntries.sort((a, b) => {
      if (!!a.read !== !!b.read) {
        return a.read ? 1 : -1
      }
      return (b.publishedAt || 0) - (a.publishedAt || 0)
    })
  }

  return nextEntries.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
}
