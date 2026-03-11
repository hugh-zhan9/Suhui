import { describe, expect, it } from "vitest"

import { canRecoverRsshubByError } from "./rsshub-recovery"

describe("rsshub recovery", () => {
  it("未配置外部 RSSHub 时应允许引导配置", () => {
    expect(canRecoverRsshubByError("RSSHUB_EXTERNAL_UNCONFIGURED: 未配置外部 RSSHub 实例")).toBe(
      true,
    )
  })

  it("普通错误不显示引导按钮", () => {
    expect(canRecoverRsshubByError("HTTP 404")).toBe(false)
    expect(canRecoverRsshubByError("")).toBe(false)
  })
})
