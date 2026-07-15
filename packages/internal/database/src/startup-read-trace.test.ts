import { afterEach, describe, expect, it, vi } from "vitest"

import { debugStartupReadTrace, isStartupReadTraceEnabled } from "./startup-read-trace"

describe("isStartupReadTraceEnabled", () => {
  afterEach(() => {
    delete (globalThis as any).__startupReadTraceFlags
    vi.restoreAllMocks()
  })

  it("requires one of the explicit startup read trace argv flags", () => {
    expect(isStartupReadTraceEnabled(["electron"])).toBe(false)
    expect(isStartupReadTraceEnabled(["electron", "--debug-startup-read-trace"])).toBe(true)
    expect(isStartupReadTraceEnabled(["electron", "--debug-startup-force-wide-read-trace"])).toBe(
      true,
    )
  })

  it("does not build detailed data until the preload-style flag is enabled", () => {
    const getData = vi.fn(() => ({ detail: true }))
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)

    debugStartupReadTrace("trace", getData)
    expect(getData).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
    ;(globalThis as any).__startupReadTraceFlags = { enabled: true }
    debugStartupReadTrace("trace", getData)
    expect(getData).toHaveBeenCalledOnce()
    expect(info).toHaveBeenCalledWith("trace", { detail: true })
  })
})
