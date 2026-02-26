type AffectedEntry = {
  feedId?: string | null
  inboxHandle?: string | null
}

export const applyUnreadCountForAffectedEntries = ({
  currentCounts,
  affectedEntries,
  operation,
}: {
  currentCounts: Record<string, number>
  affectedEntries: AffectedEntry[]
  operation: "increment" | "decrement"
}) => {
  const deltaById = new Map<string, number>()

  for (const entry of affectedEntries) {
    const id = entry.inboxHandle || entry.feedId
    if (!id) continue
    deltaById.set(id, (deltaById.get(id) || 0) + 1)
  }

  return Array.from(deltaById.entries()).map(([id, delta]) => ({
    id,
    count:
      operation === "increment"
        ? (currentCounts[id] || 0) + delta
        : Math.max(0, (currentCounts[id] || 0) - delta),
  }))
}

export const applyUnreadDeltaForAffectedEntries = ({
  currentCounts,
  affectedEntries,
}: {
  currentCounts: Record<string, number>
  affectedEntries: AffectedEntry[]
}) =>
  applyUnreadCountForAffectedEntries({
    currentCounts,
    affectedEntries,
    operation: "decrement",
  })
