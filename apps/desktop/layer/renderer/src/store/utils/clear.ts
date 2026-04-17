import { deleteDB } from "@suhui/database/db"
import { getStorageNS } from "@suhui/utils/ns"

import {
  clearStartupSnapshotsByNamespace,
  clearStartupSnapshotsForUserChange,
} from "~/initialize/startup-snapshot"

import { clearImageDimensionsDb } from "../image/db"

export const DB_SCOPED_RENDERER_STORAGE_KEYS = [getStorageNS("translation-cache")]

export const clearLocalPersistStoreData = async () => {
  await Promise.all([deleteDB(), clearImageDimensionsDb()])
}

export const clearDbScopedPersistedRendererState = () => {
  for (const key of DB_SCOPED_RENDERER_STORAGE_KEYS) {
    globalThis.localStorage?.removeItem(key)
  }
  void clearStartupSnapshotsByNamespace()
}

const storedUserId = getStorageNS("user_id")
export const clearDataIfLoginOtherAccount = (newUserId: string) => {
  const oldUserId = localStorage.getItem(storedUserId)
  localStorage.setItem(storedUserId, newUserId)
  if (oldUserId !== newUserId) {
    void clearStartupSnapshotsForUserChange(newUserId)
    return clearLocalPersistStoreData()
  }
}
