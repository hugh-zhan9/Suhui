import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  initializeDB,
  scheduleSkipNextIndexedDbMigration,
  SKIP_NEXT_INDEXED_DB_MIGRATION_KEY,
} from "@suhui/database/db.desktop"
import { migrateFromIndexedDB } from "@suhui/database/migrate-indexed-db"

vi.mock("@suhui/database/migrate-indexed-db", () => ({
  migrateFromIndexedDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("drizzle-orm/pg-proxy", () => ({
  drizzle: vi.fn(() => ({ mocked: true })),
}))

describe("db.desktop skip-next migration guard", () => {
  const createStorage = () => {
    const store = new Map<string, string>()
    return {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
      clear: vi.fn(() => {
        store.clear()
      }),
    }
  }

  beforeEach(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: createStorage(),
    })
    vi.clearAllMocks()
    ;(window as any).electron = {
      ipcRenderer: {
        invoke: vi.fn().mockResolvedValue({ rows: [] }),
      },
    }
  })

  it("skips migrateFromIndexedDB only on the first reload after a DB switch", async () => {
    scheduleSkipNextIndexedDbMigration()

    await initializeDB()

    expect(migrateFromIndexedDB).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(SKIP_NEXT_INDEXED_DB_MIGRATION_KEY)).toBeNull()

    await initializeDB()

    expect(migrateFromIndexedDB).toHaveBeenCalledTimes(1)
  })
})
