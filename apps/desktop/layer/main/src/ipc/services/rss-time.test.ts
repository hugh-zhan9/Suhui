import { describe, expect, it } from "vitest"

import { toTimestampMs } from "./rss-time"

describe("toTimestampMs", () => {
  it("keeps number values", () => {
    expect(toTimestampMs(1710000000000)).toBe(1710000000000)
  })

  it("converts Date to number", () => {
    const date = new Date("2026-03-11T09:00:00.000Z")
    expect(toTimestampMs(date)).toBe(date.getTime())
  })

  it("parses date strings", () => {
    const raw = "2026-03-11T09:00:00.000Z"
    expect(toTimestampMs(raw)).toBe(Date.parse(raw))
  })

  it("returns null for empty input", () => {
    expect(toTimestampMs(null)).toBeNull()
    expect(toTimestampMs(undefined)).toBeNull()
    expect(toTimestampMs("")).toBeNull()
  })
})
