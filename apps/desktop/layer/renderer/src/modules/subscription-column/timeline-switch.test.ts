import { describe, expect, it } from "vitest"

import { buildTimelineSwitchNavigation } from "./timeline-switch"

describe("timeline switch navigation", () => {
  it("切换 tab 时应清空 feedId/entryId，避免沿用旧订阅导致空列表", () => {
    expect(buildTimelineSwitchNavigation("timeline/articles")).toEqual({
      timelineId: "timeline/articles",
      feedId: null,
      entryId: null,
    })
  })
})

