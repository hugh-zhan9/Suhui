import { FeedViewType } from "@follow/constants"
import { describe, expect, it } from "vitest"

import { getLocalSupportedViewList, getTrendingSupportedViewList } from "./local-views"

describe("local supported views", () => {
  it("本地 RSS 视图应包含图片和视频分类", () => {
    const views = getLocalSupportedViewList()
    const viewIds = views.map((view) => view.view)

    expect(viewIds).toContain(FeedViewType.Pictures)
    expect(viewIds).toContain(FeedViewType.Videos)
  })

  it("趋势页应移除音频和通知分类", () => {
    const views = getTrendingSupportedViewList()
    const viewIds = views.map((view) => view.view)

    expect(viewIds).not.toContain(FeedViewType.Audios)
    expect(viewIds).not.toContain(FeedViewType.Notifications)
    expect(viewIds).toContain(FeedViewType.Articles)
  })
})
