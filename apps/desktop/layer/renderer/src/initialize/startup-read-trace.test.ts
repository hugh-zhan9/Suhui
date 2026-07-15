import { afterEach, describe, expect, it, vi } from "vitest"

import { debugStartupReadTrace, isStartupReadTraceEnabled } from "./startup-read-trace"

describe("isStartupReadTraceEnabled", () => {
  afterEach(() => {
    delete window.__startupReadTraceFlags
  })

  it("requires the explicit preload flag", () => {
    expect(isStartupReadTraceEnabled()).toBe(false)
    window.__startupReadTraceFlags = {
      enabled: false,
      forceWideRenderMarkRead: false,
      label: "disabled",
    }
    expect(isStartupReadTraceEnabled()).toBe(false)
    window.__startupReadTraceFlags!.enabled = true
    expect(isStartupReadTraceEnabled()).toBe(true)
  })

  it("does not build detailed data while the preload flag is disabled", () => {
    const getData = vi.fn(() => ({ detail: true }))

    debugStartupReadTrace("trace", getData)

    expect(getData).not.toHaveBeenCalled()
  })
})
