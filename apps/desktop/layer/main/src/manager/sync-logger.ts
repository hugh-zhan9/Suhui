/**
 * SyncLogger — 同步操作日志拦截器
 * 
 * 职责：
 * - 提供内存队列收集 DB 写事件
 * - 根据 SyncManager 的 deviceId 和 logicalClock 组装完整的 SyncOp
 * - 拦截器：提供 record、drain 接口，支持回放时 pause
 */

import { randomUUID } from "node:crypto"
import type { SyncManagerInstance } from "./sync"

export type OpType = 
  | "entry.mark_read"
  | "entry.mark_unread"
  | "collection.add"
  | "collection.remove"
  | "subscription.add"
  | "subscription.remove"
  | "subscription.update"
  | "setting.update"

export type EntityType = "entry" | "feed" | "subscription" | "collection" | "setting"

export interface SyncOp {
  opId: string
  deviceId: string
  logicalClock: number
  ts: number
  type: OpType
  entityType: EntityType
  entityId: string
  payload?: Record<string, unknown>
}

export interface SyncLoggerInstance {
  record(op: Omit<SyncOp, "opId" | "deviceId" | "logicalClock" | "ts">): void
  drain(fromClock?: number): SyncOp[]
  pause(): void
  resume(): void
}

export function createSyncLogger(getSyncManager: () => SyncManagerInstance): SyncLoggerInstance {
  let ops: SyncOp[] = []
  let isPaused = false

  return {
    record(baseOp: Omit<SyncOp, "opId" | "deviceId" | "logicalClock" | "ts">) {
      if (isPaused) return

      try {
        const syncManager = getSyncManager()
        const deviceId = syncManager.getDeviceId()
        const logicalClock = syncManager.bumpLogicalClock()
        
        const fullOp: SyncOp = {
          ...baseOp,
          opId: randomUUID(),
          deviceId,
          logicalClock,
          ts: Date.now(),
        }
        
        ops.push(fullOp)
      } catch (err) {
        // 如果 SyncManager 尚未初始化，忽略录制（不阻止应用正常使用）
        console.warn("[SyncLogger] Failed to record op, SyncManager might not be initialized:", err)
      }
    },

    drain(fromClock: number = 0) {
      const result = ops.filter(op => op.logicalClock > fromClock)
      
      // 清理已 drain 且未超出的
      ops = ops.filter(op => op.logicalClock <= fromClock)
      
      return result
    },

    pause() {
      isPaused = true
    },

    resume() {
      isPaused = false
    }
  }
}

export const syncLogger = createSyncLogger(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SyncManager } = require("./sync")
  return SyncManager
})
