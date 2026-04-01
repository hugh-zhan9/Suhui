import { describe, expect, it } from "vitest"

import { resolvePublishedAtMs, toTimestampMs } from "./rss-time"

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

  it("发布时间缺失时不应回退为当前时间", () => {
    expect(resolvePublishedAtMs("2026-03-11T09:00:00.000Z")).toBe(
      Date.parse("2026-03-11T09:00:00.000Z"),
    )
    expect(resolvePublishedAtMs(null)).toBe(0)
    expect(resolvePublishedAtMs("")).toBe(0)
  })
})
