import { describe, expect, it, vi } from "vitest"

import {
  ensureRsshubRuntimeReady,
  isRsshubRuntimeRunning,
  toRsshubRuntimeError,
} from "./rsshub-precheck"

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

  it("已运行时不应触发重启", async () => {
    const restart = vi.fn(async () => {})
    await ensureRsshubRuntimeReady({
      getStatus: async () => ({ status: "running" }),
      restart,
    })
    expect(restart).not.toHaveBeenCalled()
  })

  it("未运行时应先重启再检查状态", async () => {
    const restart = vi.fn(async () => {})
    let callCount = 0
    await ensureRsshubRuntimeReady({
      getStatus: async () => {
        callCount += 1
        return callCount === 1 ? { status: "stopped" } : { status: "running" }
      },
      restart,
    })
    expect(restart).toHaveBeenCalledTimes(1)
  })

  it("重启后仍不可用应抛出对应错误", async () => {
    await expect(
      ensureRsshubRuntimeReady({
        getStatus: async () => ({ status: "cooldown" }),
        restart: async () => {},
      }),
    ).rejects.toThrow(/RSSHub in cooldown/)
  })
})
