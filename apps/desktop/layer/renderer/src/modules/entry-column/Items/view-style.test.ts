import { FeedViewType } from "@follow/constants"
import { describe, expect, it } from "vitest"

import { isArticleLikeListView } from "./view-style"

describe("view-style", () => {
  it("All 与 Articles 视图应使用统一文章列表样式", () => {
    expect(isArticleLikeListView(FeedViewType.All)).toBe(true)
    expect(isArticleLikeListView(FeedViewType.Articles)).toBe(true)
    expect(isArticleLikeListView(FeedViewType.SocialMedia)).toBe(false)
  })
})

