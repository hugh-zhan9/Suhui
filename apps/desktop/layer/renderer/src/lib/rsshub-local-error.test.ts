import { describe, expect, it } from "vitest"

import {
  getRsshubFriendlyMessage,
  getRsshubLocalErrorTitle,
  parseRsshubLocalError,
  shouldShowRsshubRestartAction,
} from "./rsshub-local-error"

describe("rsshub local error parser", () => {
  it("应识别不可用错误", () => {
    const type = parseRsshubLocalError("RSSHUB_LOCAL_UNAVAILABLE: 内置 RSSHub 当前未运行")
    expect(type).toBe("unavailable")
    expect(getRsshubLocalErrorTitle(type)).toBe("内置 RSSHub 当前未运行")
    expect(shouldShowRsshubRestartAction(type)).toBe(true)
  })

  it("应识别冷却与健康检查错误", () => {
    expect(parseRsshubLocalError("RSSHub in cooldown")).toBe("cooldown")
    expect(parseRsshubLocalError("RSSHub health check failed")).toBe("healthcheck")
  })

  it("非 RSSHub 错误不触发重启按钮", () => {
    const type = parseRsshubLocalError("HTTP 404")
    expect(type).toBe("none")
    expect(getRsshubLocalErrorTitle(type)).toBe("")
    expect(shouldShowRsshubRestartAction(type)).toBe(false)
  })

  it("应输出友好错误文案", () => {
    expect(getRsshubFriendlyMessage("RSSHub in cooldown")).toBe("内置 RSSHub 处于冷却中")
    expect(getRsshubFriendlyMessage("HTTP 404")).toBe("HTTP 404")
  })
})
