import { beforeEach, describe, expect, it, vi } from "vitest"
import { getStorageNS } from "@suhui/utils/ns"

import { QUERY_PERSIST_KEY } from "../constants/app"
import { queryClient } from "./query-client"
import { resetRendererAfterDatabaseSwitch } from "./client"

describe("resetRendererAfterDatabaseSwitch", () => {
  const translationCacheKey = getStorageNS("translation-cache")
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
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createStorage(),
    })
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: createStorage(),
    })
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        reload: vi.fn(),
      },
    })

    vi.clearAllMocks()
  })

  it("clears renderer caches and reloads after a successful DB switch", async () => {
    localStorage.setItem(QUERY_PERSIST_KEY, JSON.stringify({ cached: true }))
    localStorage.setItem(translationCacheKey, JSON.stringify({ foo: "bar" }))

    const cancelQueries = vi.spyOn(queryClient, "cancelQueries").mockResolvedValue()
    const clear = vi.spyOn(queryClient, "clear").mockImplementation(() => undefined)
    await resetRendererAfterDatabaseSwitch()

    expect(cancelQueries).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(QUERY_PERSIST_KEY)).toBeNull()
    expect(localStorage.getItem(translationCacheKey)).toBeNull()
    expect(sessionStorage.getItem("follow:skip-next-indexeddb-migration")).toBe("1")
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })
})
