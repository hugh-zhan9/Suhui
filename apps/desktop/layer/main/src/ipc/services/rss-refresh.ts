import { createHash } from "node:crypto"

type FeedRow = {
  id: string
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteUrl: string | null
  errorAt: string | null
  ownerUserId: string | null
  errorMessage: string | null
  subscriptionCount: number | null
  updatesPerWeek: number | null
  latestEntryPublishedAt: string | null
  tipUserIds: string[] | null
  updatedAt: number | null
}

type ParsedFeed = {
  title: string | null
  description: string | null
  image: string | null
  siteUrl: string | null
}

type EntryIdentityLike = {
  guid?: string | null
  url?: string | null
  title?: string | null
  publishedAt?: string | number | Date | null
}

type ExistingEntryReuseCandidate = EntryIdentityLike & {
  id: string
  insertedAt?: number | null
  read?: boolean | number | string | null
}

export type ExistingEntryReuseIndex = {
  idByIdentityKey: Map<string, string>
  idByTitlePublishedKey: Map<string, string>
  readById: Map<string, boolean>
}

export const buildRefreshedFeed = (existing: FeedRow, parsed: ParsedFeed) => {
  return {
    ...existing,
    title: parsed.title || existing.title || "Untitled Feed",
    description: parsed.description || existing.description || null,
    image: parsed.image || existing.image || null,
    siteUrl: parsed.siteUrl || existing.siteUrl || null,
    errorAt: null,
    errorMessage: null,
    updatedAt: Date.now(),
  }
}

export const buildFailedFeed = (existing: FeedRow, errorMessage: string) => {
  return {
    ...existing,
    errorAt: new Date().toISOString(),
    errorMessage,
    updatedAt: Date.now(),
  }
}

export const buildStableLocalEntryId = ({
  feedId,
  guid,
  url,
  title,
  publishedAt,
}: {
  feedId: string
  guid?: string | null
  url?: string | null
  title?: string | null
  publishedAt?: string | number | null
}) => {
  const identity = [
    feedId,
    guid?.trim() || "",
    url?.trim() || "",
    title?.trim() || "",
    publishedAt ? String(publishedAt) : "",
  ].join("|")

  const digest = createHash("sha1").update(identity).digest("hex").slice(0, 16)
  return `local_entry_${feedId}_${digest}`
}

const normalizeIdentityText = (value?: string | null) => value?.trim() || ""

const normalizePublishedAtIdentityPart = (publishedAt?: string | number | Date | null) => {
  if (publishedAt instanceof Date) {
    return publishedAt.getTime() > 0 ? String(publishedAt.getTime()) : ""
  }
  if (typeof publishedAt === "number") {
    return Number.isFinite(publishedAt) && publishedAt > 0 ? String(publishedAt) : ""
  }
  const normalized = typeof publishedAt === "string" ? publishedAt.trim() : ""
  if (!normalized || normalized === "0") return ""
  return normalized
}

export const buildEntryTitlePublishedKey = ({ title, publishedAt }: EntryIdentityLike) => {
  const normalizedTitle = normalizeIdentityText(title)
  const normalizedPublishedAt = normalizePublishedAtIdentityPart(publishedAt)
  if (!normalizedTitle || !normalizedPublishedAt) return null
  return `tp:${normalizedTitle}|${normalizedPublishedAt}`
}

export const buildEntryIdentityKey = ({ guid, url, title, publishedAt }: EntryIdentityLike) => {
  const normalizedGuid = normalizeIdentityText(guid)
  if (normalizedGuid) return `guid:${normalizedGuid}`

  const normalizedUrl = normalizeIdentityText(url)
  if (normalizedUrl) return `url:${normalizedUrl}`

  return (
    buildEntryTitlePublishedKey({ title, publishedAt }) ||
    `tp:${title || ""}|${publishedAt ? String(publishedAt) : ""}`
  )
}

const normalizeRead = (value: ExistingEntryReuseCandidate["read"]) => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true"
  return false
}

const shouldPreferReuseCandidate = (
  current: ExistingEntryReuseCandidate | undefined,
  candidate: ExistingEntryReuseCandidate,
) => {
  if (!current) return true

  const currentInsertedAt =
    typeof current.insertedAt === "number" && Number.isFinite(current.insertedAt)
      ? current.insertedAt
      : Number.NEGATIVE_INFINITY
  const candidateInsertedAt =
    typeof candidate.insertedAt === "number" && Number.isFinite(candidate.insertedAt)
      ? candidate.insertedAt
      : Number.NEGATIVE_INFINITY

  if (candidateInsertedAt !== currentInsertedAt) {
    return candidateInsertedAt > currentInsertedAt
  }

  return candidate.id > current.id
}

export const buildExistingEntryReuseIndex = (
  entries: ExistingEntryReuseCandidate[],
): ExistingEntryReuseIndex => {
  const candidateByIdentityKey = new Map<string, ExistingEntryReuseCandidate>()
  const candidateByTitlePublishedKey = new Map<string, ExistingEntryReuseCandidate>()
  const readById = new Map<string, boolean>()

  for (const entry of entries) {
    readById.set(entry.id, normalizeRead(entry.read))

    const identityKey = buildEntryIdentityKey(entry)
    const existingIdentityCandidate = candidateByIdentityKey.get(identityKey)
    if (shouldPreferReuseCandidate(existingIdentityCandidate, entry)) {
      candidateByIdentityKey.set(identityKey, entry)
    }

    const titlePublishedKey = buildEntryTitlePublishedKey(entry)
    if (!titlePublishedKey) continue

    const existingTitlePublishedCandidate = candidateByTitlePublishedKey.get(titlePublishedKey)
    if (shouldPreferReuseCandidate(existingTitlePublishedCandidate, entry)) {
      candidateByTitlePublishedKey.set(titlePublishedKey, entry)
    }
  }

  return {
    idByIdentityKey: new Map(
      Array.from(candidateByIdentityKey.entries()).map(([key, entry]) => [key, entry.id]),
    ),
    idByTitlePublishedKey: new Map(
      Array.from(candidateByTitlePublishedKey.entries()).map(([key, entry]) => [key, entry.id]),
    ),
    readById,
  }
}

export const resolveExistingEntryIdForRefresh = (
  index: ExistingEntryReuseIndex,
  entry: EntryIdentityLike,
) => {
  const identityMatch = index.idByIdentityKey.get(buildEntryIdentityKey(entry))
  if (identityMatch) return identityMatch

  const titlePublishedKey = buildEntryTitlePublishedKey(entry)
  if (!titlePublishedKey) return null

  return index.idByTitlePublishedKey.get(titlePublishedKey) || null
}
