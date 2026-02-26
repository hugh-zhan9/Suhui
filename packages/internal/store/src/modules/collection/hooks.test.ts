import { FeedViewType } from "@follow/constants"
import { describe, expect, it } from "vitest"

import { getCollectionEntryIds } from "./hooks"

describe("collection hooks", () => {
  it("收藏列表应返回全部收藏，不受当前 view 过滤", () => {
    const ids = getCollectionEntryIds(
      {
        "entry-1": {
          entryId: "entry-1",
          view: FeedViewType.Articles,
          createdAt: "2026-02-26T00:00:00.000Z",
        },
        "entry-2": {
          entryId: "entry-2",
          view: FeedViewType.SocialMedia,
          createdAt: "2026-02-26T01:00:00.000Z",
        },
      } as any,
      FeedViewType.Articles,
    )

    expect(ids).toEqual(["entry-2", "entry-1"])
  })
})
