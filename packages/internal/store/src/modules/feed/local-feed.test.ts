import { describe, expect, it } from "vitest"

import { shouldTreatFeedAsRemoteBiz } from "./local-feed"

describe("shouldTreatFeedAsRemoteBiz", () => {
  it("keeps imported local numeric feeds on the local path", () => {
    expect(
      shouldTreatFeedAsRemoteBiz({
        id: "55190448903059456",
        feed: { url: "https://werss.anan.eu.org/3572959446.xml", ownerUserId: null } as any,
      }),
    ).toBe(false)
  })

  it("still treats owned numeric feeds as remote biz feeds", () => {
    expect(
      shouldTreatFeedAsRemoteBiz({
        id: "55190448903059456",
        feed: { url: "https://example.com/rss.xml", ownerUserId: "user_1" } as any,
      }),
    ).toBe(true)
  })
})
