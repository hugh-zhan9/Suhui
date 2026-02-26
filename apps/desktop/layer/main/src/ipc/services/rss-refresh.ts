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
  updatedAt: Date | null
}

type ParsedFeed = {
  title: string | null
  description: string | null
  image: string | null
  siteUrl: string | null
}

export const buildRefreshedFeed = (existing: FeedRow, parsed: ParsedFeed) => {
  return {
    ...existing,
    title: parsed.title || existing.title || "Untitled Feed",
    description: parsed.description || existing.description || null,
    image: parsed.image || existing.image || null,
    siteUrl: parsed.siteUrl || existing.siteUrl || null,
    updatedAt: new Date(),
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

export const buildEntryIdentityKey = ({
  guid,
  url,
  title,
  publishedAt,
}: {
  guid?: string | null
  url?: string | null
  title?: string | null
  publishedAt?: string | number | Date | null
}) => {
  if (guid) return `guid:${guid}`
  if (url) return `url:${url}`
  return `tp:${title || ""}|${publishedAt ? String(publishedAt) : ""}`
}
