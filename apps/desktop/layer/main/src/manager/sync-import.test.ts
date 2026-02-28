import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { randomUUID } from "node:crypto"

// TDD: 先写测试，后写实现

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "freefolo-sync-import-test-"))
}

describe("importState", () => {
  let tmpRepoDir: string
  
  beforeEach(() => {
    tmpRepoDir = makeTmpDir()
    // 构造一些假数据
    const dateChunks = new Date().toISOString().split("T")
    const today = dateChunks[0]!
    const opsDir = path.join(tmpRepoDir, "ops", today)
    fs.mkdirSync(opsDir, { recursive: true })
    
    // 生成一个假设备的 ndjson
    const mockOps = [
      {
        opId: "op-1",
        deviceId: "dev-remote",
        logicalClock: 10,
        ts: 1000,
        type: "entry.mark_read",
        entityType: "entry",
        entityId: "entry-1"
      }
    ]
    fs.writeFileSync(path.join(opsDir, "dev-remote.ndjson"), mockOps.map(o => JSON.stringify(o)).join("\n") + "\n")
  })

  afterEach(() => {
    fs.rmSync(tmpRepoDir, { recursive: true, force: true })
  })

  it("应读取指定目录下的所有 ndjson，排除自身的 deviceId", async () => {
    // @ts-ignore
    const { importState } = await import("./sync-import.js")

    const mockManager = {
      getDeviceId: () => "dev-local",
      getSyncRepoPath: () => tmpRepoDir,
      updateLastImportAt: vi.fn(),
    }

    const appliedOps = new Set<string>()
    const mockApplyOp = vi.fn(async (op: any) => {
      appliedOps.add(op.opId)
      return
    })

    await importState(mockManager as any, { applyOp: mockApplyOp as any, isOpApplied: async (id) => appliedOps.has(id), markOpApplied: async (id) => { appliedOps.add(id) } })

    expect(mockApplyOp).toHaveBeenCalled()
    expect(mockApplyOp.mock.calls[0]![0].opId).toBe("op-1")
    expect(mockManager.updateLastImportAt).toHaveBeenCalled()
  })

  it("当 op 已被标记 applies 时应被跳过", async () => {
    // @ts-ignore
    const { importState } = await import("./sync-import.js")

    const mockManager = {
      getDeviceId: () => "dev-local",
      getSyncRepoPath: () => tmpRepoDir,
      updateLastImportAt: vi.fn(),
    }

    const mockApplyOp = vi.fn()

    // 默认 isOpApplied 为 true
    await importState(mockManager as any, { applyOp: mockApplyOp, isOpApplied: async () => true, markOpApplied: async () => {} })

    expect(mockApplyOp).not.toHaveBeenCalled()
  })
})
