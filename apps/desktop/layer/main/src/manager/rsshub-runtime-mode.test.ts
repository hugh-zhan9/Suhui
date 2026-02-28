import { describe, expect, it } from "vitest"

import { normalizeRsshubRuntimeMode } from "./rsshub-runtime-mode"

describe("rsshub runtime mode", () => {
  it("应仅接受 lite 与 official 两种模式", () => {
    expect(normalizeRsshubRuntimeMode("lite")).toBe("lite")
    expect(normalizeRsshubRuntimeMode("official")).toBe("official")
  })

  it("无效值应回退到 lite", () => {
    expect(normalizeRsshubRuntimeMode(undefined)).toBe("lite")
    expect(normalizeRsshubRuntimeMode(null)).toBe("lite")
    expect(normalizeRsshubRuntimeMode("")).toBe("lite")
    expect(normalizeRsshubRuntimeMode("xxx")).toBe("lite")
  })
})
