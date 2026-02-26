import { FeedViewType } from "@follow/constants"
import type { CollectionSchema } from "@follow/database/schemas/types"
import { describe, expect, it } from "vitest"

import { getCollectionEntryIdsByFeedIds } from "@follow/store/subscription/store"

describe("subscription unsubscribe collection cleanup", () => {
  it("取消订阅后应筛出对应 feed 的收藏 entryIds 并清理", () => {
    const collections: Record<string, CollectionSchema> = {
      "entry-a": {
        entryId: "entry-a",
        feedId: "feed-a",
        createdAt: new Date().toISOString(),
        view: FeedViewType.All,
      },
      "entry-b": {
        entryId: "entry-b",
        feedId: "feed-b",
        createdAt: new Date().toISOString(),
        view: FeedViewType.All,
      },
      "entry-c": {
        entryId: "entry-c",
        feedId: null,
        createdAt: new Date().toISOString(),
        view: FeedViewType.All,
      },
    }

    const entryIds = getCollectionEntryIdsByFeedIds(collections, ["feed-a"])
    expect(entryIds).toEqual(["entry-a"])
  })
})
