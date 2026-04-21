import { describe, expect, it } from "vitest"

import {
  getSourceContentStatusAfterEvent,
  isSourceContentHardFailEvent,
} from "./source-content-state"

describe("SourceContentView state transitions", () => {
  it("treats main-frame load failures as hard fail except aborted navigations", () => {
    expect(isSourceContentHardFailEvent({ isMainFrame: true, errorCode: -105 })).toBe(true)
    expect(isSourceContentHardFailEvent({ isMainFrame: true, errorCode: -3 })).toBe(false)
    expect(isSourceContentHardFailEvent({ isMainFrame: false, errorCode: -105 })).toBe(false)
  })

  it("resets on src change and allows degraded pages to recover on late success", () => {
    expect(getSourceContentStatusAfterEvent("ready", { type: "src-changed" })).toBe("loading")
    expect(getSourceContentStatusAfterEvent("loading", { type: "timeout" })).toBe("degraded")
    expect(getSourceContentStatusAfterEvent("degraded", { type: "success" })).toBe("ready")
    expect(getSourceContentStatusAfterEvent("hard-fail", { type: "timeout" })).toBe("hard-fail")
  })
})
