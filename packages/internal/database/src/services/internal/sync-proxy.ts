export const recordSyncOp = (opType: string, entityType: string, entityId: string, payload?: any) => {
  if (typeof window !== "undefined" && (window as any).electron?.ipcRenderer) {
    (window as any).electron.ipcRenderer
      .invoke("sync.recordOp", opType, entityType, entityId, payload)
      .catch((err: any) => console.error("[Sync] recordSyncOp error:", err))
  }
}
