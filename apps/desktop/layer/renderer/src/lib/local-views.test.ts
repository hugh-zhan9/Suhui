import { FeedViewType } from "@follow/constants"
import { describe, expect, it } from "vitest"

import { getLocalSupportedViewList } from "./local-views"

describe("local supported views", () => {
  it("本地 RSS 视图中不应包含图片和视频分类", () => {
    const views = getLocalSupportedViewList()
    const viewIds = views.map((view) => view.view)

    expect(viewIds).not.toContain(FeedViewType.Pictures)
    expect(viewIds).not.toContain(FeedViewType.Videos)
  })
})
