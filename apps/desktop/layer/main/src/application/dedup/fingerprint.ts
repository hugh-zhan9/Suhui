import { createHash } from "node:crypto"

const TRACKING_PARAMETERS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"])

const hash = (value: string) => createHash("sha256").update(value).digest("hex")

export const normalizeText = (input: string) =>
  input
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim()

export const canonicalizeEntryUrl = (input: string | null | undefined) => {
  if (!input) return null
  try {
    const url = new URL(input)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    url.hash = ""
    url.hostname = url.hostname.toLowerCase()
    if (
      (url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")
    ) {
      url.port = ""
    }
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key)
      }
    }
    url.searchParams.sort()
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "")
    return url.toString()
  } catch {
    return null
  }
}

export type DedupFingerprint = {
  fingerprint: string
  basis: "canonical_url" | "title_content"
}

export const createEntryFingerprint = (entry: {
  url?: string | null
  title?: string | null
  content?: string | null
  description?: string | null
}): DedupFingerprint | null => {
  const url = canonicalizeEntryUrl(entry.url)
  if (url) return { fingerprint: hash(`url:${url}`), basis: "canonical_url" }

  return createTextFingerprint(entry)
}

export const createTextFingerprint = (entry: {
  title?: string | null
  content?: string | null
  description?: string | null
}): DedupFingerprint | null => {
  const title = normalizeText(entry.title ?? "")
  const body = normalizeText(entry.content ?? entry.description ?? "").slice(0, 2_000)
  if (!title || body.length < 40) return null
  return { fingerprint: hash(`text:${title}\n${body}`), basis: "title_content" }
}

export type RepresentativeCandidate = {
  id: string
  publishedAt: number
  contentLength: number
  hasUserInvestment: boolean
}

export const chooseClusterRepresentative = (
  candidates: RepresentativeCandidate[],
  manualRepresentativeEntryId?: string | null,
) => {
  if (
    manualRepresentativeEntryId &&
    candidates.some((candidate) => candidate.id === manualRepresentativeEntryId)
  ) {
    return manualRepresentativeEntryId
  }
  return [...candidates].sort(
    (left, right) =>
      Number(right.hasUserInvestment) - Number(left.hasUserInvestment) ||
      right.contentLength - left.contentLength ||
      left.publishedAt - right.publishedAt ||
      left.id.localeCompare(right.id),
  )[0]?.id
}
