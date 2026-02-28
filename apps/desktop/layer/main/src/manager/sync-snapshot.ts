import * as fs from "node:fs"
import * as path from "node:path"
import { DBManager } from "./db"
import { SyncManagerInstance } from "./sync"
import { SubscriptionService } from "@follow/database/services/subscription"
import { CollectionService } from "@follow/database/services/collection"
import { EntryService } from "@follow/database/services/entry"
import { inArray } from "drizzle-orm"

export interface SyncSnapshot {
  deviceId: string
  timestamp: number
  logicalClock: number
  subscriptions: any[]
  collections: any[]
  readEntries: string[]
}

export async function compactSnapshot(manager: SyncManagerInstance): Promise<void> {
  const repoPath = manager.getSyncRepoPath()
  if (!repoPath) return

  const db = DBManager.getDB()

  // 1. 获取全量订阅
  const subscriptions = await db.query.subscriptionsTable.findMany()

  // 2. 获取全量收藏 (由于数据量可能较大，这里不一次性展开，如果是轻量级收藏可以直接获取)
  const collections = await db.query.collectionsTable.findMany()

  // 3. 获取全量已读条目 (数据量极大，考虑只保存最近一年或直接提取 ID)
  // 获取所有 read = true 的 entries
  const readEntriesRaw = await db.query.entriesTable.findMany({
    where: (entries, { eq }) => eq(entries.read, true),
    columns: { id: true }
  })
  const readEntries = readEntriesRaw.map(r => r.id)

  const snapshot: SyncSnapshot = {
    deviceId: manager.getDeviceId(),
    timestamp: Date.now(),
    logicalClock: manager.getLogicalClock(),
    subscriptions,
    collections,
    readEntries
  }

  const snapshotDir = path.join(repoPath, "snapshot")
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true })
  }

  const snapshotFile = path.join(snapshotDir, "latest.json")
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2), "utf-8")
}

export async function importFromSnapshot(manager: SyncManagerInstance): Promise<void> {
  const repoPath = manager.getSyncRepoPath()
  if (!repoPath) return

  const snapshotFile = path.join(repoPath, "snapshot", "latest.json")
  if (!fs.existsSync(snapshotFile)) return

  try {
    const data = fs.readFileSync(snapshotFile, "utf-8")
    const snapshot = JSON.parse(data) as SyncSnapshot

    // 如果本设备已经有一定数据或已同步过，避免全量覆盖，通常在新设备初次接入时调用
    if (manager.getLogicalClock() > 0) {
      console.warn("[SyncSnapshot] Local logical clock > 0, snapshot import should only run on fresh devices.")
      return
    }

    // 1. 导入订阅
    if (snapshot.subscriptions && snapshot.subscriptions.length > 0) {
      await SubscriptionService.upsertMany(snapshot.subscriptions)
    }

    // 2. 导入收藏
    if (snapshot.collections && snapshot.collections.length > 0) {
      await CollectionService.upsertMany(snapshot.collections)
    }

    // 3. 导入已读状态 (仅更新现有 entry 的状态)
    if (snapshot.readEntries && snapshot.readEntries.length > 0) {
      // 分批更新防止 SQLite statement too long
      const batchSize = 500
      for (let i = 0; i < snapshot.readEntries.length; i += batchSize) {
        const batchIds = snapshot.readEntries.slice(i, i + batchSize)
        await EntryService.patchMany({ entryIds: batchIds, entry: { read: true } as any })
      }
    }

    console.info(`[SyncSnapshot] Imported snapshot from device ${snapshot.deviceId} at ${new Date(snapshot.timestamp).toISOString()}`)
  } catch (err) {
    console.error("[SyncSnapshot] Failed to import snapshot:", err)
  }
}
