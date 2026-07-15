export type EntryChangeReason = "refresh" | "read" | "collection" | "subscription" | "import"
export type EntryChangeScope = "feeds" | "all"

export type EntryChangeEventV1 = {
  version: 1
  batchId: string
  reason: EntryChangeReason
  source: string
  scope: EntryChangeScope
  feedIds: string[]
  entryIds?: string[]
  refreshed?: number
  failed?: number
  completedAt: number
  feedId?: string
}

export type EntryChangeResponse<T> = T & {
  batchId: string
  changeSet: EntryChangeEventV1
}

const reasons = new Set<EntryChangeReason>([
  "refresh",
  "read",
  "collection",
  "subscription",
  "import",
])
const scopes = new Set<EntryChangeScope>(["feeds", "all"])

const normalizeRequiredString = (value: unknown) => {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized || null
}

const normalizeIds = (value: unknown) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null

  const seen = new Set<string>()
  const normalized: string[] = []
  for (const item of value) {
    const id = item.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    normalized.push(id)
  }
  return normalized
}

const normalizeOptionalCount = (value: unknown) => {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || (value as number) < 0) return null
  return value as number
}

const normalizeEntryChangeEventV1 = (input: unknown): EntryChangeEventV1 | null => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  if (value.version !== 1) return null

  const batchId = normalizeRequiredString(value.batchId)
  const source = normalizeRequiredString(value.source)
  const feedIds = normalizeIds(value.feedIds)
  const entryIds = value.entryIds === undefined ? undefined : normalizeIds(value.entryIds)
  const refreshed = normalizeOptionalCount(value.refreshed)
  const failed = normalizeOptionalCount(value.failed)
  const completedAt = value.completedAt
  const reason = value.reason
  const scope = value.scope

  if (
    !batchId ||
    !source ||
    !feedIds ||
    entryIds === null ||
    refreshed === null ||
    failed === null ||
    !reasons.has(reason as EntryChangeReason) ||
    !scopes.has(scope as EntryChangeScope) ||
    !Number.isInteger(completedAt) ||
    (completedAt as number) < 0
  ) {
    return null
  }

  if (scope === "feeds" && feedIds.length === 0 && reason !== "refresh") return null
  if (
    scope === "feeds" &&
    reason === "refresh" &&
    refreshed !== undefined &&
    refreshed !== feedIds.length
  ) {
    return null
  }

  const feedId = value.feedId === undefined ? undefined : normalizeRequiredString(value.feedId)
  if (value.feedId !== undefined && !feedId) return null
  if (feedId && (scope !== "feeds" || feedIds.length !== 1 || feedIds[0] !== feedId)) return null

  return {
    version: 1,
    batchId,
    reason: reason as EntryChangeReason,
    source,
    scope: scope as EntryChangeScope,
    feedIds,
    ...(entryIds === undefined ? {} : { entryIds }),
    ...(refreshed === undefined ? {} : { refreshed }),
    ...(failed === undefined ? {} : { failed }),
    completedAt: completedAt as number,
    ...(feedId ? { feedId } : {}),
  }
}

export const createEntryChangeEventV1 = (
  input: Omit<EntryChangeEventV1, "version">,
): EntryChangeEventV1 => {
  const normalized = normalizeEntryChangeEventV1({ version: 1, ...input })
  if (!normalized) throw new TypeError("Invalid EntryChangeEventV1")
  return normalized
}

export const parseEntryChangeEventV1 = (input: unknown): EntryChangeEventV1 | null =>
  normalizeEntryChangeEventV1(input)
