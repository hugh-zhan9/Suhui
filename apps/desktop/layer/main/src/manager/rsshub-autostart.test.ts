import { describe, expect, it } from "vitest"

import { normalizeRsshubAutoStart } from "./rsshub-autostart"

describe("rsshub auto start", () => {
  it("仅 true 被视为开启", () => {
    expect(normalizeRsshubAutoStart(true)).toBe(true)
    expect(normalizeRsshubAutoStart(false)).toBe(false)
    expect(normalizeRsshubAutoStart(0)).toBe(false)
    expect(normalizeRsshubAutoStart(null)).toBe(false)
    expect(normalizeRsshubAutoStart("true")).toBe(false)
  })
})
