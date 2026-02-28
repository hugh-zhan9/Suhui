/**
 * SyncImport - 状态导入与回放执行者
 * 
 * 职责：
 * - 扫描所有 ops/YYYY-MM-DD 目录
 * - 排除本设备生成的 ops 文件
 * - 读取远端设备产生的 ndjson 文件
 * - 调用 SyncOpApplier 接口逐个校验与执行（幂等性）
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { SyncManagerInstance } from "./sync"
import type { SyncOp } from "./sync-logger"

export interface SyncOpApplier {
  applyOp(op: SyncOp): Promise<void>
  isOpApplied(opId: string): Promise<boolean>
  markOpApplied(opId: string): Promise<void>
  savePendingOp?(op: SyncOp): Promise<void>
}

export async function importState(
  manager: SyncManagerInstance,
  applier: SyncOpApplier
): Promise<void> {
  const repoPath = manager.getSyncRepoPath()
  if (!repoPath) {
    throw new Error("[SyncImport] 尚未配置 syncRepoPath，无法执行导入")
  }

  const opsBaseDir = path.join(repoPath, "ops")
  if (!fs.existsSync(opsBaseDir)) {
    return // 没有任何可同步的数据
  }

  const deviceId = manager.getDeviceId()

  // 1. 获取所有日期目录并排序（如 2026-02-28）
  const dateDirs = fs.readdirSync(opsBaseDir)
    .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort()

  let importedCount = 0

  // 2. 遍历每一天的 ops
  for (const dateDir of dateDirs) {
    const fullDateDir = path.join(opsBaseDir, dateDir)
    const files = fs.readdirSync(fullDateDir)

    // 排除自身的
    const remoteFiles = files.filter(f => f.endsWith(".ndjson") && f !== `${deviceId}.ndjson`)

    for (const file of remoteFiles) {
      const fullFilePath = path.join(fullDateDir, file)
      const lines = fs.readFileSync(fullFilePath, "utf-8").split("\n").filter(l => l.trim().length > 0)

      for (const line of lines) {
        let op: SyncOp
        try {
          op = JSON.parse(line) as SyncOp
        } catch {
          console.warn(`[SyncImport] ndjson 残缺行检测，忽略: ${file} at ${dateDir}`)
          continue
        }

        // 3. 幂等检查
        const applied = await applier.isOpApplied(op.opId)
        if (applied) {
          continue
        }

        // 4. 回放操作
        try {
          await applier.applyOp(op)
          await applier.markOpApplied(op.opId)
          importedCount++
        } catch (err: any) {
          if (err.name === "OrphanError" && applier.savePendingOp) {
            await applier.savePendingOp(op)
            // 孤儿也被标记为 processed（下次会在 drainPendingOps 时继续尝试）
            await applier.markOpApplied(op.opId)
            importedCount++
          } else {
            console.error(`[SyncImport] Failed to apply op ${op.opId}:`, err)
            // LWW 拒绝或者严重错误导致的回落
          }
        }
      }
    }
  }

  // 哪怕没有任何新的远端 OP 进来，一次成功的扫描和拉取也可以算作是“确认过没有新数据”，我们刷新这个拉取检查时间
  manager.updateLastImportAt(Date.now())
}
