import { describe, expect, it, vi } from "vitest"

import { debugStartupReadTrace, isStartupReadTraceEnabled } from "./startup-read-trace"

describe("isStartupReadTraceEnabled", () => {
  it("requires one of the explicit startup read trace argv flags", () => {
    expect(isStartupReadTraceEnabled(["electron"])).toBe(false)
    expect(isStartupReadTraceEnabled(["electron", "--debug-startup-read-trace"])).toBe(true)
    expect(isStartupReadTraceEnabled(["electron", "--debug-startup-force-wide-read-trace"])).toBe(
      true,
    )
  })

  it("does not build or write detailed data without the argv flag", () => {
    const getData = vi.fn(() => ({ detail: true }))
    const write = vi.fn()

    debugStartupReadTrace("trace", getData, write)

    expect(getData).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })
})
