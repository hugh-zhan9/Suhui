export const normalizeRsshubLiteWhitelist = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const result: string[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (typeof item !== "string") continue
    const trimmed = item.trim()
    if (!trimmed) continue
    const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

export const parseRsshubLiteWhitelistText = (value: string): string[] => {
  return normalizeRsshubLiteWhitelist(value.split("\n"))
}

export const stringifyRsshubLiteWhitelist = (list: string[]): string => {
  return normalizeRsshubLiteWhitelist(list).join("\n")
}
