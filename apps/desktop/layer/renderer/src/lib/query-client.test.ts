import { persistQueryClientRestore } from "@tanstack/react-query-persist-client"
import { QueryClient } from "@tanstack/react-query"
import { beforeEach, describe, expect, it } from "vitest"

import { QUERY_PERSIST_KEY } from "../constants/app"

const storageData = new Map<string, string>()
const memoryStorage: Storage = {
  get length() {
    return storageData.size
  },
  clear: () => storageData.clear(),
  getItem: (key) => storageData.get(key) ?? null,
  key: (index) => Array.from(storageData.keys())[index] ?? null,
  removeItem: (key) => {
    storageData.delete(key)
  },
  setItem: (key, value) => {
    storageData.set(key, value)
  },
}
;(window as any).localStorage = memoryStorage

const queryClientModule = await import("./query-client")

describe("entry query persisted cache contract", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("uses a stable entry summary-page buster", () => {
    expect(queryClientModule).toHaveProperty("ENTRY_QUERY_PERSIST_BUSTER")
    expect((queryClientModule as any).persistConfig.buster).toBe(
      (queryClientModule as any).ENTRY_QUERY_PERSIST_BUSTER,
    )
  })

  it("discards persisted timestamp-cursor pages written with the old buster", async () => {
    window.localStorage.setItem(
      QUERY_PERSIST_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        buster: "timestamp-cursor-v0",
        clientState: {
          mutations: [],
          queries: [
            {
              queryKey: ["entries", "feed-1"],
              queryHash: '["entries","feed-1"]',
              state: {
                data: { pages: [{ data: [], pageParam: "2026-01-01T00:00:00.000Z" }] },
                dataUpdateCount: 1,
                dataUpdatedAt: Date.now(),
                error: null,
                errorUpdateCount: 0,
                errorUpdatedAt: 0,
                fetchFailureCount: 0,
                fetchFailureReason: null,
                fetchMeta: null,
                isInvalidated: false,
                status: "success",
                fetchStatus: "idle",
              },
            },
          ],
        },
      }),
    )
    const queryClient = new QueryClient()

    await persistQueryClientRestore({
      queryClient,
      ...(queryClientModule as any).persistConfig,
    })

    expect(queryClient.getQueryData(["entries", "feed-1"])).toBeUndefined()
    expect(window.localStorage.getItem(QUERY_PERSIST_KEY)).toBeNull()
  })
})
