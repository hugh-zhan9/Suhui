/**
 * SyncExport — 增量状态导出执行者
 * 
 * 职责：
 * - 提取 SyncLogger 积压的 SyncOp
 * - 按天归档追加到 sync repo 中的 ndjson 文件
 * - 更新最后导出时间
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type { SyncManagerInstance } from "./sync"
import type { SyncLoggerInstance } from "./sync-logger"

export async function exportState(
  manager: SyncManagerInstance,
  logger: SyncLoggerInstance
): Promise<void> {
  const ops = logger.drain()
  if (ops.length === 0) {
    // 即使没有任何积累的 ops，也当做成功执行了一次（无变更）导出检查，更新时间水位
    manager.updateLastExportAt(Date.now())
    return
  }

  const repoPath = manager.getSyncRepoPath()
  if (!repoPath) {
    throw new Error("[SyncExport] 尚未配置 syncRepoPath，无法导出状态")
  }

  const dateStr = new Date().toISOString().split("T")[0]
  if (!dateStr) {
    throw new Error("[SyncExport] 生成日期异常")
  }

  const deviceId = manager.getDeviceId()
  const destDir = path.join(repoPath, "ops", dateStr)
  const destFile = path.join(destDir, `${deviceId}.ndjson`)

  try {
    // 确保存在 ops/YYYY-MM-DD 目录
    fs.mkdirSync(destDir, { recursive: true })

    // 将 JSON 序列化为换行分隔的字符串，末尾必须有换行符
    const ndjsonLines = ops.map((op) => JSON.stringify(op)).join("\n") + "\n"

    // 追加写入
    fs.appendFileSync(destFile, ndjsonLines, "utf-8")

    // 更新导出时间水位线
    manager.updateLastExportAt(Date.now())

    // 清理并归档 30 天前的数据
    archiveOldOps(repoPath)
  } catch (err) {
    console.error("[SyncExport] 导出状态失败:", err)
    // 理想情况下应当把 ops 塞回队列重试，当前暂抛出异常以中断上层流程
    throw err
  }
}

export function archiveOldOps(repoPath: string): void {
  const opsBaseDir = path.join(repoPath, "ops")
  if (!fs.existsSync(opsBaseDir)) return

  const archiveDir = path.join(repoPath, "archive", "ops")
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true })
  }

  const dateDirs = fs.readdirSync(opsBaseDir).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  for (const dateDir of dateDirs) {
    const dirTimestamp = new Date(dateDir).getTime()
    if (dirTimestamp < thirtyDaysAgo) {
      const srcDir = path.join(opsBaseDir, dateDir)
      const destDir = path.join(archiveDir, dateDir)
      try {
        fs.renameSync(srcDir, destDir)
        console.info(`[SyncExport] Archived old ops directory: ${dateDir}`)
      } catch (err) {
        console.error(`[SyncExport] Failed to archive ${dateDir}:`, err)
      }
    }
  }
}
