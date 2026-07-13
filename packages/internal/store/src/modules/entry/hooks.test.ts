import { describe, expect, it } from "vitest"

import * as entryHooks from "./hooks"

const { deriveEntriesIds } = entryHooks

describe("deriveEntriesIds", () => {
  it("应去重重复的条目 id，避免列表重复渲染", () => {
    const ids = deriveEntriesIds({
      data: {
        pages: [
          {
            data: [{ id: "entry_1" }, { id: "entry_2" }],
          },
          {
            data: [{ id: "entry_1" }, { id: "entry_3" }],
          },
        ],
      },
      isLoading: false,
      isError: false,
    })

    expect(ids).toEqual(["entry_1", "entry_2", "entry_3"])
  })

  it("uses page.nextCursor rather than publishedAt", () => {
    expect(entryHooks).toHaveProperty("getEntryNextPageParam")
    const getEntryNextPageParam = (entryHooks as any).getEntryNextPageParam

    expect(
      getEntryNextPageParam({
        data: [],
        page: { limit: 20, hasMore: true, nextCursor: "opaque" },
      }),
    ).toBe("opaque")
  })
})
