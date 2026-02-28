/**
 * SyncManager 单元测试
 * TDD: 先写测试，后写实现
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

// 将在实现后解除注释/导入
// import { SyncManager, createSyncManager } from "./sync"

// ======== helpers ========

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "freefolo-sync-test-"))
}

// 隔离依赖，防止 Vite 误解析底层 Drizzle schema 导致 Parse error
vi.mock("./sync-applier", () => ({ dbSyncApplier: {} }))
vi.mock("./db", () => ({ DBManager: {} }))
vi.mock("@follow/database/schemas/sync", () => ({}))

// ======== 测试套件 ========

describe("SyncManager - deviceId 初始化", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("首次 init 应生成 deviceId 并持久化到 sync-local-meta.json", async () => {
    // 动态导入实现（测试时会 fail，直到实现存在）
    const { createSyncManager } = await import("./sync")
    const manager = createSyncManager({ userDataPath: tmpDir })
    await manager.init()

    const deviceId = manager.getDeviceId()
    expect(deviceId).toBeTruthy()
    expect(typeof deviceId).toBe("string")

    // 确认持久化
    const metaPath = path.join(tmpDir, "sync-local-meta.json")
    expect(fs.existsSync(metaPath)).toBe(true)
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
    expect(meta.deviceId).toBe(deviceId)
  })

  it("重复 init 应读取已有 deviceId，不重新生成", async () => {
    const { createSyncManager } = await import("./sync")
    const manager1 = createSyncManager({ userDataPath: tmpDir })
    await manager1.init()
    const id1 = manager1.getDeviceId()

    // 再次初始化
    const manager2 = createSyncManager({ userDataPath: tmpDir })
    await manager2.init()
    const id2 = manager2.getDeviceId()

    expect(id1).toBe(id2)
  })

  it("未配置 syncRepoPath 时 hasSyncRepo 返回 false", async () => {
    const { createSyncManager } = await import("./sync")
    const manager = createSyncManager({ userDataPath: tmpDir })
    await manager.init()

    expect(manager.hasSyncRepo()).toBe(false)
  })

  it("updateSyncRepoPath 后 hasSyncRepo 返回 true", async () => {
    const { createSyncManager } = await import("./sync")
    const manager = createSyncManager({ userDataPath: tmpDir })
    await manager.init()

    const repoPath = makeTmpDir()
    try {
      await manager.updateSyncRepoPath(repoPath)
      expect(manager.hasSyncRepo()).toBe(true)
      expect(manager.getSyncRepoPath()).toBe(repoPath)

      // 确认持久化
      const metaPath = path.join(tmpDir, "sync-local-meta.json")
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
      expect(meta.syncRepoPath).toBe(repoPath)
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true })
    }
  })

  it("getStatus 应返回正确结构", async () => {
    const { createSyncManager } = await import("./sync")
    const manager = createSyncManager({ userDataPath: tmpDir })
    await manager.init()

    const status = manager.getStatus()
    expect(status).toMatchObject({
      deviceId: expect.any(String),
      syncRepoPath: null,
      lastExportAt: null,
      lastImportAt: null,
    })
  })
})
