import { FeedViewType } from "@follow/constants"
import { describe, expect, it } from "vitest"

import { isPDFExportSupportedView } from "./export-as-pdf"

describe("isPDFExportSupportedView", () => {
  it("仅在文章和图片视图返回 true", () => {
    expect(isPDFExportSupportedView(FeedViewType.Articles)).toBe(true)
    expect(isPDFExportSupportedView(FeedViewType.Pictures)).toBe(true)

    expect(isPDFExportSupportedView(FeedViewType.SocialMedia)).toBe(false)
    expect(isPDFExportSupportedView(FeedViewType.Videos)).toBe(false)
    expect(isPDFExportSupportedView(FeedViewType.All)).toBe(true)
    expect(isPDFExportSupportedView(FeedViewType.Audios)).toBe(false)
    expect(isPDFExportSupportedView(FeedViewType.Notifications)).toBe(false)
  })
})
