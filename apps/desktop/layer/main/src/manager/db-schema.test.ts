import {
  getRuntimeDbType,
  resetRuntimeDbType,
  setRuntimeDbType,
} from "@suhui/database/schemas/runtime"
import { beforeEach, describe, expect, it } from "vitest"

describe("schema runtime dialect", () => {
  beforeEach(() => {
    resetRuntimeDbType()
    delete (globalThis as any).__followDbType
  })

  it("未设定时回落 postgres（保持接线完成前的既有行为）", () => {
    expect(getRuntimeDbType()).toBe("postgres")
  })

  it("显式设定 sqlite 后生效", () => {
    setRuntimeDbType("sqlite")
    expect(getRuntimeDbType()).toBe("sqlite")
  })

  it("显式设定 postgres 后生效", () => {
    setRuntimeDbType("postgres")
    expect(getRuntimeDbType()).toBe("postgres")
  })

  it("全局变量可指定 sqlite（供测试与早期启动阶段使用）", () => {
    ;(globalThis as any).__followDbType = "sqlite"
    expect(getRuntimeDbType()).toBe("sqlite")
  })

  it("显式设定优先于全局变量", () => {
    ;(globalThis as any).__followDbType = "sqlite"
    setRuntimeDbType("postgres")
    expect(getRuntimeDbType()).toBe("postgres")
  })
})
