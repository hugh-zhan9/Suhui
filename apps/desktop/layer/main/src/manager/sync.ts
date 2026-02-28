/**
 * SyncManager — 多设备同步核心管理器
 *
 * 职责：
 * - deviceId 初始化与持久化
 * - sync-local-meta.json 读写（logicalClock 水位线、syncRepoPath 等）
 * - 对外暴露同步状态查询 / 路径配置接口
 * - 触发定时 flush（外部由 bootstrap.ts 调用）
 */

import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { hostname } from "node:os"
import { join } from "node:path"
import { exportState } from "./sync-export"
import { importState } from "./sync-import"
import { dbSyncApplier } from "./sync-applier"
import { syncLogger } from "./sync-logger"
import { GitRunner } from "./git-runner"

// ===== 类型定义 =====

export interface LocalSyncMeta {
  deviceId: string
  deviceName: string
  logicalClock: number
  syncRepoPath: string | null
  lastExportAt: number | null
  lastImportAt: number | null
}

export interface SyncStatus {
  deviceId: string
  syncRepoPath: string | null
  lastExportAt: number | null
  lastImportAt: number | null
}

const SYNC_LOCAL_META_FILENAME = "sync-local-meta.json"

// ===== SyncManager 实例接口 =====

export interface SyncManagerInstance {
  init(): Promise<void>
  getDeviceId(): string
  hasSyncRepo(): boolean
  getSyncRepoPath(): string | null
  updateSyncRepoPath(repoPath: string): Promise<void>
  getStatus(): SyncStatus
  getLogicalClock(): number
  bumpLogicalClock(): number
  updateLastExportAt(ts: number): void
  updateLastImportAt(ts: number): void
  getLocalMeta(): LocalSyncMeta
  gitSync(): Promise<void>
}

// ===== 工厂函数（依赖注入，便于测试）=====

export interface SyncManagerDeps {
  userDataPath: string
  generateId?: () => string
  getDeviceName?: () => string
}

export function createSyncManager(deps: SyncManagerDeps): SyncManagerInstance {
  const { userDataPath, generateId = randomUUID, getDeviceName = hostname } = deps

  let localMeta: LocalSyncMeta | null = null

  function getMetaPath(): string {
    return join(userDataPath, SYNC_LOCAL_META_FILENAME)
  }

  function readMeta(): LocalSyncMeta | null {
    const metaPath = getMetaPath()
    if (!existsSync(metaPath)) return null
    try {
      return JSON.parse(readFileSync(metaPath, "utf-8")) as LocalSyncMeta
    } catch {
      return null
    }
  }

  function writeMeta(meta: LocalSyncMeta): void {
    mkdirSync(userDataPath, { recursive: true })
    writeFileSync(getMetaPath(), JSON.stringify(meta, null, 2), "utf-8")
  }

  return {
    async init(): Promise<void> {
      const existing = readMeta()
      if (existing) {
        localMeta = existing
        return
      }

      // 首次初始化：生成新 deviceId
      const newMeta: LocalSyncMeta = {
        deviceId: generateId(),
        deviceName: getDeviceName(),
        logicalClock: 0,
        syncRepoPath: null,
        lastExportAt: null,
        lastImportAt: null,
      }
      writeMeta(newMeta)
      localMeta = newMeta
    },

    getDeviceId(): string {
      if (!localMeta) throw new Error("[SyncManager] 未初始化，请先调用 init()")
      return localMeta.deviceId
    },

    hasSyncRepo(): boolean {
      return !!localMeta?.syncRepoPath
    },

    getSyncRepoPath(): string | null {
      return localMeta?.syncRepoPath ?? null
    },

    async updateSyncRepoPath(repoPath: string): Promise<void> {
      if (!localMeta) throw new Error("[SyncManager] 未初始化，请先调用 init()")
      localMeta = { ...localMeta, syncRepoPath: repoPath }
      writeMeta(localMeta)
    },

    getStatus(): SyncStatus {
      if (!localMeta) throw new Error("[SyncManager] 未初始化，请先调用 init()")
      return {
        deviceId: localMeta.deviceId,
        syncRepoPath: localMeta.syncRepoPath,
        lastExportAt: localMeta.lastExportAt,
        lastImportAt: localMeta.lastImportAt,
      }
    },

    getLogicalClock(): number {
      return localMeta?.logicalClock ?? 0
    },

    bumpLogicalClock(): number {
      if (!localMeta) throw new Error("[SyncManager] 未初始化，请先调用 init()")
      localMeta = { ...localMeta, logicalClock: localMeta.logicalClock + 1 }
      writeMeta(localMeta)
      return localMeta.logicalClock
    },

    updateLastExportAt(ts: number): void {
      if (!localMeta) return
      localMeta = { ...localMeta, lastExportAt: ts }
      writeMeta(localMeta)
    },

    updateLastImportAt(ts: number): void {
      if (!localMeta) return
      localMeta = { ...localMeta, lastImportAt: ts }
      writeMeta(localMeta)
    },

    getLocalMeta(): LocalSyncMeta {
      if (!localMeta) throw new Error("[SyncManager] 未初始化，请先调用 init()")
      return { ...localMeta }
    },

    async gitSync(): Promise<void> {
      if (!localMeta?.syncRepoPath) return

      const now = Date.now()
      if (localMeta.lastExportAt && Math.abs(now - localMeta.lastExportAt) > 365 * 24 * 60 * 60 * 1000) {
        console.warn(`[SyncManager] Clock drift detected! Current time ${new Date(now).toISOString()} differs from last export by > 1 year. Local NTP might be wrong.`)
      }

      const runner = new GitRunner(localMeta.syncRepoPath)

      try {
        // 1. 导出本地缓冲区状态
        await exportState(this, syncLogger)

        // 2. 执行 Git 网络同步
        await runner.sync(`Sync from ${localMeta.deviceId} at ${new Date().toISOString()}`)

        // 3. 读入并应用远端新增的操作
        await importState(this, dbSyncApplier)
      } catch (err) {
        console.error("[SyncManager] gitSync failed:", err)
        throw err
      }
    },
  }
}

// ===== 全局单例（主进程使用）=====
// 由 bootstrap.ts 在 init 阶段调用 SyncManager.init()

import { app } from "electron"

function createMainSyncManager(): SyncManagerInstance {
  return createSyncManager({
    userDataPath: app.getPath("userData"),
  })
}

// 延迟创建，避免在 electron app 未就绪时调用 app.getPath
let _mainSyncManager: SyncManagerInstance | null = null

export const SyncManager: SyncManagerInstance = new Proxy({} as SyncManagerInstance, {
  get(_target, prop: string | symbol) {
    if (!_mainSyncManager) {
      _mainSyncManager = createMainSyncManager()
    }
    return (_mainSyncManager as any)[prop]
  },
})
