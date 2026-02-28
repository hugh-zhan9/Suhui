/**
 * SyncLogger 单元测试
 * TDD: 先写测试，后写实现
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

// 将在实现后解除注释/导入
// import { SyncLogger, createSyncLogger } from "./sync-logger"

vi.mock("./sync-applier", () => ({ dbSyncApplier: {} }))
vi.mock("./db", () => ({ DBManager: {} }))
vi.mock("@follow/database/schemas/sync", () => ({}))

describe("SyncLogger", () => {
  it("record() 应自动生成 opId, ts, deviceId，并自增 logicalClock", async () => {
    const { createSyncLogger } = await import("./sync-logger")

    const mockManager = {
      getDeviceId: () => "mock-device-id",
      bumpLogicalClock: vi.fn().mockImplementation(() => 101),
    }

    const logger = createSyncLogger(() => mockManager as any)

    logger.record({
      type: "entry.mark_read",
      entityType: "entry",
      entityId: "test-entry-1",
    })

    const ops = logger.drain()
    expect(ops.length).toBe(1)
    expect(ops[0]?.type).toBe("entry.mark_read")
    expect(ops[0]?.entityType).toBe("entry")
    expect(ops[0]?.entityId).toBe("test-entry-1")
    expect(ops[0]?.deviceId).toBe("mock-device-id")
    expect(ops[0]?.logicalClock).toBe(101)
    expect(typeof ops[0]?.opId).toBe("string")
    expect(typeof ops[0]?.ts).toBe("number")
    expect(mockManager.bumpLogicalClock).toHaveBeenCalledTimes(1)
  })

  it("pause() 期间 record() 应被忽略", async () => {
    const { createSyncLogger } = await import("./sync-logger")
    const mockManager = {
      getDeviceId: () => "mock-device-id",
      bumpLogicalClock: vi.fn(),
    }
    const logger = createSyncLogger(() => mockManager as any)

    logger.pause()
    logger.record({
      type: "entry.mark_read",
      entityType: "entry",
      entityId: "test-entry-1",
    })
    logger.resume()

    const ops = logger.drain()
    expect(ops.length).toBe(0)
    expect(mockManager.bumpLogicalClock).not.toHaveBeenCalled()
  })

  it("drain() 可以选择性根据 fromClock 提供增量同步", async () => {
    const { createSyncLogger } = await import("./sync-logger")
    
    let clock = 100
    const mockManager = {
      getDeviceId: () => "mock-device-id",
      bumpLogicalClock: vi.fn().mockImplementation(() => ++clock), // 101, 102, 103
    }
    const logger = createSyncLogger(() => mockManager as any)

    logger.record({ type: "entry.mark_read", entityType: "entry", entityId: "e1" }) // 101
    logger.record({ type: "entry.mark_read", entityType: "entry", entityId: "e2" }) // 102
    logger.record({ type: "entry.mark_read", entityType: "entry", entityId: "e3" }) // 103

    const ops = logger.drain(101) // 只取 > 101 的，应包含 e2(102)和 e3(103)
    
    expect(ops.length).toBe(2)
    expect(ops[0]?.entityId).toBe("e2")
    expect(ops[1]?.entityId).toBe("e3")

    // drain 会清空已提取的部分(102, 103)，但早期未提取的部分(101)仍在
    const remaining = logger.drain()
    expect(remaining.length).toBe(1)
    expect(remaining[0]?.entityId).toBe("e1")
  })
})
