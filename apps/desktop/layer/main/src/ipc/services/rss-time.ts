type TimestampInput = number | string | Date | null | undefined

export const toTimestampMs = (input: TimestampInput): number | null => {
  if (input === null || input === undefined) return null
  if (input instanceof Date) return input.getTime()
  if (typeof input === "number") return Number.isFinite(input) ? input : null
  const trimmed = input.trim()
  if (!trimmed) return null
  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) return numeric
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
