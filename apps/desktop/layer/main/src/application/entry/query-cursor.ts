import type { AnyColumn, SQL } from "drizzle-orm"
import { and, eq, lt, or } from "drizzle-orm"

import { EntryQueryError } from "./query-types"

export type EntryCursor = {
  v: 1
  publishedAt: number
  insertedAt: number
  id: string
}

const isEntryCursor = (value: unknown): value is EntryCursor => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const cursor = value as Partial<EntryCursor>
  return (
    cursor.v === 1 &&
    typeof cursor.publishedAt === "number" &&
    Number.isFinite(cursor.publishedAt) &&
    typeof cursor.insertedAt === "number" &&
    Number.isFinite(cursor.insertedAt) &&
    typeof cursor.id === "string" &&
    cursor.id.trim().length > 0
  )
}

export const encodeEntryCursor = (cursor: EntryCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")

export const decodeEntryCursor = (cursor: string): EntryCursor => {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("invalid base64url")
    const buffer = Buffer.from(cursor, "base64url")
    if (buffer.toString("base64url") !== cursor) throw new Error("non-canonical base64url")
    const decoded = JSON.parse(buffer.toString("utf8")) as unknown
    if (isEntryCursor(decoded)) return decoded
  } catch {
    // Convert all codec failures to the stable application error below.
  }
  throw new EntryQueryError("SUHUI_INVALID_CURSOR", "cursor is invalid")
}

export const createEntryCursorWhere = (
  entries: { publishedAt: AnyColumn; insertedAt: AnyColumn; id: AnyColumn },
  cursor: EntryCursor | null,
): SQL | undefined => {
  if (!cursor) return undefined
  return or(
    lt(entries.publishedAt, cursor.publishedAt),
    and(eq(entries.publishedAt, cursor.publishedAt), lt(entries.insertedAt, cursor.insertedAt)),
    and(
      eq(entries.publishedAt, cursor.publishedAt),
      eq(entries.insertedAt, cursor.insertedAt),
      lt(entries.id, cursor.id),
    ),
  )
}
