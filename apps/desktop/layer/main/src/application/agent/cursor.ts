import { AgentApplicationError, type AgentEntriesCursor } from "./types"

const isCursor = (value: unknown): value is AgentEntriesCursor => {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<AgentEntriesCursor>
  return (
    typeof candidate.publishedAt === "number" &&
    Number.isFinite(candidate.publishedAt) &&
    typeof candidate.insertedAt === "number" &&
    Number.isFinite(candidate.insertedAt) &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0
  )
}

export const encodeAgentEntriesCursor = (cursor: AgentEntriesCursor): string => {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

export const decodeAgentEntriesCursor = (cursor: string): AgentEntriesCursor => {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown
    if (isCursor(decoded)) return decoded
  } catch {}

  throw new AgentApplicationError("SUHUI_INVALID_CURSOR", "cursor is invalid", 400)
}

export const isEntryAfterCursor = (
  entry: AgentEntriesCursor,
  cursor: AgentEntriesCursor,
): boolean => {
  if (entry.publishedAt !== cursor.publishedAt) return entry.publishedAt < cursor.publishedAt
  if (entry.insertedAt !== cursor.insertedAt) return entry.insertedAt < cursor.insertedAt
  return entry.id < cursor.id
}
