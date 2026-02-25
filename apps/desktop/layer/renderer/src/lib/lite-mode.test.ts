import { describe, expect, it } from "vitest"

import {
  DESKTOP_ONLY_MODE,
  LITE_MODE,
  isAIFeatureEnabledInLiteMode,
  isLoginRequiredInLiteMode,
  isPaymentEnabledInLiteMode,
  shouldShowTemporaryProblemMessage,
} from "./lite-mode"

describe("lite mode", () => {
  it("应默认启用桌面精简模式", () => {
    expect(DESKTOP_ONLY_MODE).toBe(true)
    expect(LITE_MODE).toBe(true)
  })

  it("应禁用 AI 与计费能力", () => {
    expect(isAIFeatureEnabledInLiteMode()).toBe(false)
    expect(isPaymentEnabledInLiteMode()).toBe(false)
  })

  it("应允许免登录使用并禁用 temporary problem 文案", () => {
    expect(isLoginRequiredInLiteMode()).toBe(false)
    expect(shouldShowTemporaryProblemMessage()).toBe(false)
  })
})
