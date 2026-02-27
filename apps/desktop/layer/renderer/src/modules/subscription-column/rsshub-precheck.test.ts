import { describe, expect, it } from "vitest"

import { isRsshubRuntimeRunning, toRsshubRuntimeError } from "./rsshub-precheck"

describe("rsshub precheck", () => {
  it("仅 running 视为可用", () => {
    expect(isRsshubRuntimeRunning("running")).toBe(true)
    expect(isRsshubRuntimeRunning("starting")).toBe(false)
    expect(isRsshubRuntimeRunning("cooldown")).toBe(false)
    expect(isRsshubRuntimeRunning()).toBe(false)
  })

  it("cooldown 应返回冷却错误，其余返回不可用错误", () => {
    expect(toRsshubRuntimeError("cooldown").message).toContain("RSSHub in cooldown")
    expect(toRsshubRuntimeError("error").message).toContain("RSSHUB_LOCAL_UNAVAILABLE")
  })
})
