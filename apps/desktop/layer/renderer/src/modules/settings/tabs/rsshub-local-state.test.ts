import { describe, expect, it } from "vitest"

import type { LocalRsshubState } from "./rsshub-local-state"
import {
  getLocalRsshubStatusLabel,
  getLocalRsshubUiTickMs,
  normalizeLocalRsshubState,
} from "./rsshub-local-state"

describe("rsshub local state", () => {
  it("应将缺失状态归一化为 unknown", () => {
    const state = normalizeLocalRsshubState()

    expect(state.status).toBe("unknown")
    expect(state.port).toBeNull()
    expect(state.consoleUrl).toBeNull()
    expect(state.retryCount).toBe(0)
    expect(state.cooldownUntil).toBeNull()
    expect(state.runtimeMode).toBe("lite")
    expect(state.liteSupportedRoutes).toEqual([])
  })

  it("应保留有效状态字段", () => {
    const state = normalizeLocalRsshubState({
      status: "running",
      port: 12138,
      consoleUrl: "http://127.0.0.1:12138/?token=abc",
      retryCount: 1,
      cooldownUntil: null,
      runtimeMode: "official",
      liteSupportedRoutes: ["/sspai/index"],
    })

    expect(state.status).toBe("running")
    expect(state.port).toBe(12138)
    expect(state.consoleUrl).toBe("http://127.0.0.1:12138/?token=abc")
    expect(state.retryCount).toBe(1)
    expect(state.runtimeMode).toBe("official")
    expect(state.liteSupportedRoutes).toEqual(["/sspai/index"])
  })

  it("cooldown 状态应显示剩余秒数", () => {
    const now = 1_000
    const state: LocalRsshubState = {
      status: "cooldown",
      port: null,
      consoleUrl: null,
      retryCount: 3,
      cooldownUntil: 3_200,
      runtimeMode: "lite",
      liteSupportedRoutes: [],
    }

    expect(getLocalRsshubStatusLabel(state, now)).toBe("冷却中（3秒后自动重试）")
  })

  it("running 状态应附带端口信息", () => {
    const state: LocalRsshubState = {
      status: "running",
      port: 17890,
      consoleUrl: null,
      retryCount: 0,
      cooldownUntil: null,
      runtimeMode: "lite",
      liteSupportedRoutes: [],
    }

    expect(getLocalRsshubStatusLabel(state)).toBe("运行中（127.0.0.1:17890）")
  })

  it("cooldown 状态应启用 1s UI 刷新节拍", () => {
    const state: LocalRsshubState = {
      status: "cooldown",
      port: null,
      consoleUrl: null,
      retryCount: 0,
      cooldownUntil: Date.now() + 5_000,
      runtimeMode: "lite",
      liteSupportedRoutes: [],
    }
    expect(getLocalRsshubUiTickMs(state)).toBe(1000)
  })

  it("非 cooldown 状态不应启用额外 UI 刷新节拍", () => {
    const state: LocalRsshubState = {
      status: "running",
      port: 49548,
      consoleUrl: null,
      retryCount: 0,
      cooldownUntil: null,
      runtimeMode: "official",
      liteSupportedRoutes: [],
    }
    expect(getLocalRsshubUiTickMs(state)).toBeNull()
  })
})
