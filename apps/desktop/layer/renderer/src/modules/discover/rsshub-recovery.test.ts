import { describe, expect, it } from "vitest"

import { canRecoverRsshubByError } from "./rsshub-recovery"

describe("rsshub recovery", () => {
  it("RSSHub 本地错误应允许恢复", () => {
    expect(canRecoverRsshubByError("RSSHUB_LOCAL_UNAVAILABLE: 内置 RSSHub 当前未运行")).toBe(true)
    expect(canRecoverRsshubByError("内置 RSSHub 处于冷却中")).toBe(true)
  })

  it("普通错误不显示恢复按钮", () => {
    expect(canRecoverRsshubByError("HTTP 404")).toBe(false)
    expect(canRecoverRsshubByError("")).toBe(false)
  })
})
