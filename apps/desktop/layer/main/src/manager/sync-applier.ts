/**
 * SyncApplier — 处理 SyncOp 到真实本地数据库的回放逻辑
 */
import { eq, inArray } from "drizzle-orm"
import { DBManager } from "./db"
import { EntryService } from "@follow/database/services/entry"
import { SubscriptionService } from "@follow/database/services/subscription"
import { CollectionService } from "@follow/database/services/collection"
import { appliedSyncOpsTable, pendingSyncOpsTable } from "@follow/database/schemas/sync"
import type { SyncOpApplier } from "./sync-import"
import type { SyncOp } from "./sync-logger"
import { WindowManager } from "./window"
import { callWindowExpose } from "@follow/shared/bridge"

export class OrphanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrphanError"
  }
}

export async function drainPendingOps(): Promise<void> {
  const db = DBManager.getDB()
  const now = new Date()

  // 0. 清理（标记为 failed）超过 90 天的 pending ops
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  try {
    const { and, eq, lte } = require("drizzle-orm")
    await db.update(pendingSyncOpsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(pendingSyncOpsTable.status, "pending"), lte(pendingSyncOpsTable.createdAt, ninetyDaysAgo)))
  } catch (e: any) {
    console.error(`[SyncApplier] Failed to expire old pending ops: ${e.message}`)
  }

  // 1. 捞出需要重试的 ops
  const opsToRetry = await db.query.pendingSyncOpsTable.findMany({
    where: (pending, { and, eq, lte }) => and(
      eq(pending.status, "pending"),
      lte(pending.retryAfter, now)
    )
  })

  if (opsToRetry.length === 0) return

  // 2. 依次投递
  for (const record of opsToRetry) {
    let op: SyncOp
    try {
      op = JSON.parse(record.opJson) as SyncOp
    } catch {
      await db.update(pendingSyncOpsTable)
        .set({ status: "failed" })
        .where(eq(pendingSyncOpsTable.opId, record.opId))
      continue
    }

    try {
      await dbSyncApplier.applyOp(op)
      // 成功则状态更新
      await db.update(pendingSyncOpsTable)
        .set({ status: "applied", appliedAt: new Date() })
        .where(eq(pendingSyncOpsTable.opId, record.opId))
      
      // 添加到全局 applied_sync_ops
      await dbSyncApplier.markOpApplied(op.opId)

    } catch (err: any) {
      if (err.name === "OrphanError") {
        // 继续 pending, 延后 1 小时
        await db.update(pendingSyncOpsTable)
          .set({ 
            retryAfter: new Date(Date.now() + 60 * 60 * 1000),
            updatedAt: new Date()
          })
          .where(eq(pendingSyncOpsTable.opId, record.opId))
      } else {
        // 其他错误直接 failed
        console.error(`[SyncApplier] Retry failed for op ${op.opId}:`, err)
        await db.update(pendingSyncOpsTable)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(pendingSyncOpsTable.opId, record.opId))
      }
    }
  }
}

export const dbSyncApplier: SyncOpApplier = {
  async isOpApplied(opId: string): Promise<boolean> {
    const db = DBManager.getDB()
    const record = await db.query.appliedSyncOpsTable.findFirst({
      where: (ops, { eq }) => eq(ops.opId, opId)
    })
    return !!record
  },

  async markOpApplied(opId: string): Promise<void> {
    const db = DBManager.getDB()
    await db.insert(appliedSyncOpsTable).values({
      opId,
      appliedAt: new Date()
    }).onConflictDoNothing().execute()
  },

  async savePendingOp(op: SyncOp): Promise<void> {
    const db = DBManager.getDB()
    await db.insert(pendingSyncOpsTable).values({
      opId: op.opId,
      opJson: JSON.stringify(op),
      retryAfter: new Date(Date.now() + 60 * 60 * 1000), // Retry 1h later? Actually trigger immediately by refreshing, but set 1hr to pause continuous failing.
      createdAt: new Date(),
      status: "pending"
    }).onConflictDoNothing().execute()
  },

  async applyOp(op: SyncOp): Promise<void> {
    const db = DBManager.getDB()

    // 工具函数：检查 entry 是否存在
    const ensureEntryExists = async (entryId: string) => {
      const entry = await db.query.entriesTable.findFirst({
        where: (entries, { eq }) => eq(entries.id, entryId),
        columns: { id: true }
      })
      if (!entry) throw new OrphanError(`Entry ${entryId} not found yet`)
    }

    switch (op.type) {
      case "entry.mark_read":
      case "entry.mark_unread": {
        await ensureEntryExists(op.entityId)
        // Todo: 如果有 ts 的严格 LWW，应该在 entriesTable 添加 updatedAt。
        // 由于只是已读状态，幂等且单向冲突概率小，直接应用：
        const read = op.type === "entry.mark_read"
        await EntryService.patchMany({ entryIds: [op.entityId], entry: { read } })
        break
      }

      case "collection.add": {
        await ensureEntryExists(op.entityId)
        if (!op.payload) break
        // 由于 Collection 写入具有完整 payload，直接基于此upsert。
        await CollectionService.upsertMany([op.payload as any])
        break
      }

      case "collection.remove": {
        // 如果需要可以不要确保，因为删除是幂等的。
        await CollectionService.deleteMany([op.entityId])
        break
      }

      case "subscription.add": {
        if (!op.payload) break
        await SubscriptionService.upsertMany([op.payload as any])
        break
      }

      case "subscription.update": {
        if (!op.payload) break
        const existing = await db.query.subscriptionsTable.findFirst({
          where: (subs, { eq }) => eq(subs.id, op.entityId),
          columns: { id: true }
        })
        if (!existing) {
          throw new OrphanError(`Subscription ${op.entityId} not found`)
        }
        await SubscriptionService.patch({
          ...op.payload,
          id: op.entityId
        } as any)
        break
      }

      case "subscription.remove": {
        await SubscriptionService.delete(op.entityId)
        break
      }

      case "setting.update": {
        if (!op.payload) break
        const mainWindow = WindowManager.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          // Tell renderer to update its Jotai store
          callWindowExpose(mainWindow).syncSettingUpdate(op.entityId, op.payload)
        }
        break
      }

      default:
        console.warn(`[SyncApplier] Unknown op type: ${op.type}`)
    }
  }
}
