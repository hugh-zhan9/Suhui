import { describe, expect, it } from "vitest"

import { deriveEntriesIds } from "./hooks"

describe("deriveEntriesIds", () => {
  it("应去重重复的条目 id，避免列表重复渲染", () => {
    const ids = deriveEntriesIds({
      data: {
        pages: [
          {
            data: [
              { entries: { id: "entry_1" } },
              { entries: { id: "entry_2" } },
            ],
          },
          {
            data: [
              { entries: { id: "entry_1" } },
              { entries: { id: "entry_3" } },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
    })

    expect(ids).toEqual(["entry_1", "entry_2", "entry_3"])
  })
})
