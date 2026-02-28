import { app } from "electron"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import type { SyncStatus } from "~/manager/sync"
import { SyncManager } from "~/manager/sync"
import { exportState } from "~/manager/sync-export"
import { importState } from "~/manager/sync-import"
import { compactSnapshot, importFromSnapshot } from "~/manager/sync-snapshot"
import { dbSyncApplier } from "~/manager/sync-applier"
import { syncLogger } from "~/manager/sync-logger"

export class SyncService extends IpcService {
  static override readonly groupName = "sync"

  @IpcMethod()
  async getStatus(_ctx: IpcContext): Promise<SyncStatus> {
    return SyncManager.getStatus()
  }

  @IpcMethod()
  async setSyncRepoPath(_ctx: IpcContext, path: string): Promise<void> {
    await SyncManager.updateSyncRepoPath(path)
  }

  @IpcMethod()
  async recordOp(_ctx: IpcContext, opType: string, entityType: string, entityId: string, payload?: any): Promise<void> {
    syncLogger.record({
      type: opType as any,
      entityType: entityType as any,
      entityId,
      payload,
    })
  }

  @IpcMethod()
  async exportState(_ctx: IpcContext): Promise<void> {
    await exportState(SyncManager, syncLogger)
  }

  @IpcMethod()
  async importState(_ctx: IpcContext): Promise<void> {
    await importState(SyncManager, dbSyncApplier)
  }

  @IpcMethod()
  async compactSnapshot(_ctx: IpcContext): Promise<void> {
    await compactSnapshot(SyncManager)
  }

  @IpcMethod()
  async importFromSnapshot(_ctx: IpcContext): Promise<void> {
    await importFromSnapshot(SyncManager)
  }

  @IpcMethod()
  async gitSync(_ctx: IpcContext): Promise<void> {
    await SyncManager.gitSync()
  }
}
