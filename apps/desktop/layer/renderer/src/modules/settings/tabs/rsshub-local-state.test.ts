import { describe, expect, it } from "vitest"

import type { LocalRsshubState } from "./rsshub-local-state"
import { getLocalRsshubStatusLabel, normalizeLocalRsshubState } from "./rsshub-local-state"

describe("rsshub local state", () => {
  it("应将缺失状态归一化为 unknown", () => {
    const state = normalizeLocalRsshubState()

    expect(state.status).toBe("unknown")
    expect(state.port).toBeNull()
    expect(state.retryCount).toBe(0)
    expect(state.cooldownUntil).toBeNull()
  })

  it("应保留有效状态字段", () => {
    const state = normalizeLocalRsshubState({
      status: "running",
      port: 12138,
      retryCount: 1,
      cooldownUntil: null,
    })

    expect(state.status).toBe("running")
    expect(state.port).toBe(12138)
    expect(state.retryCount).toBe(1)
  })

  it("cooldown 状态应显示剩余秒数", () => {
    const now = 1_000
    const state: LocalRsshubState = {
      status: "cooldown",
      port: null,
      retryCount: 3,
      cooldownUntil: 3_200,
    }

    expect(getLocalRsshubStatusLabel(state, now)).toBe("冷却中（3秒后自动重试）")
  })

  it("running 状态应附带端口信息", () => {
    const state: LocalRsshubState = {
      status: "running",
      port: 17890,
      retryCount: 0,
      cooldownUntil: null,
    }

    expect(getLocalRsshubStatusLabel(state)).toBe("运行中（127.0.0.1:17890）")
  })
})
