import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

// 此测试先挂起（RED），按 TDD 规范编写 exportState 逻辑测试。

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "freefolo-sync-export-test-"))
}

describe("exportState", () => {
  let tmpDir: string
  
  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("当没有未导出的 op 时，立即返回且不创建文件", async () => {
    // @ts-ignore
    const { exportState } = await import("./sync-export.js")
    
    const mockManager = {
      getDeviceId: () => "test-device-id",
      getSyncRepoPath: () => tmpDir,
      updateLastExportAt: vi.fn(),
    }
    const mockLogger = {
      drain: vi.fn().mockReturnValue([]),
    }

    await exportState(mockManager as any, mockLogger as any)

    const dateChucks = new Date().toISOString().split("T")
    const dateStr = dateChucks[0]!
    const destDir = path.join(tmpDir, "ops", dateStr)
    expect(fs.existsSync(destDir)).toBe(false)
    expect(mockLogger.drain).toHaveBeenCalled()
    expect(mockManager.updateLastExportAt).toHaveBeenCalled()
  })

  it("当有新 op 时，按日期归档写入 ndjson 格式文件", async () => {
    // @ts-ignore
    const { exportState } = await import("./sync-export.js")

    const mockOps = [
      { opId: "1", type: "entry.mark_read", entityId: "e1" },
      { opId: "2", type: "subscription.add", entityId: "s1" }
    ]

    const mockManager = {
      getDeviceId: () => "test-dev-2",
      getSyncRepoPath: () => tmpDir,
      updateLastExportAt: vi.fn(),
    }
    const mockLogger = {
      drain: vi.fn().mockReturnValue(mockOps),
    }

    await exportState(mockManager as any, mockLogger as any)

    const dateChucks = new Date().toISOString().split("T")
    const dateStr = dateChucks[0]!
    const expectedFile = path.join(tmpDir, "ops", dateStr, "test-dev-2.ndjson")
    
    expect(fs.existsSync(expectedFile)).toBe(true)

    const content = fs.readFileSync(expectedFile, "utf-8")
    const lines = content.trim().split("\n")
    expect(lines.length).toBe(2)
    expect(JSON.parse(lines[0]!)).toMatchObject({ opId: "1" })
    expect(JSON.parse(lines[1]!)).toMatchObject({ opId: "2" })
    
    // 多次导出应追加
    mockLogger.drain.mockReturnValue([{ opId: "3", type: "collection.add", entityId: "c1" }])
    await exportState(mockManager as any, mockLogger as any)
    
    const content2 = fs.readFileSync(expectedFile, "utf-8")
    expect(content2.trim().split("\n").length).toBe(3)
  })

  it("只导出 logicalClock > lastExportClock 的记录，并且导出失败会抛出异常", async () => {
    // @ts-ignore
    const { exportState } = await import("./sync-export.js")
    const mockOps = [ { opId: "1" } ]

    const mockManager = {
      getDeviceId: () => "test-dev-3",
      getSyncRepoPath: () => "/invalid-path-that-does-not-exist/foo/bar",
      updateLastExportAt: vi.fn()
    }
    const mockLogger = {
      drain: vi.fn().mockReturnValue(mockOps)
    }

    let errorObj
    try {
      await exportState(mockManager as any, mockLogger as any)
    } catch(e) {
      errorObj = e
    }
    expect(errorObj).toBeDefined()
    expect(mockManager.updateLastExportAt).not.toHaveBeenCalled()
  })
})
