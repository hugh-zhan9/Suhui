export const dedupeEntryIdsPreserveOrder = (ids: string[]) => {
  if (ids.length <= 1) return ids
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}
