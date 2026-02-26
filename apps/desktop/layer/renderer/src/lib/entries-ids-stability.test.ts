import { describe, expect, it } from "vitest"

import { deriveEntriesIds } from "@follow/store/entry/hooks"

describe("entries ids stability", () => {
  it("刷新中(isLoading=true)但已有数据时，不应清空条目列表", () => {
    const ids = deriveEntriesIds({
      data: {
        pages: [
          {
            data: [
              { entries: { id: "e1" } },
              { entries: { id: "e2" } },
            ],
          },
        ],
      },
      isLoading: true,
      isError: false,
    } as any)

    expect(ids).toEqual(["e1", "e2"])
  })
})
