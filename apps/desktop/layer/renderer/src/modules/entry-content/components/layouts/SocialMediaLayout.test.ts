import { describe, expect, it } from "vitest"

import { shouldDisableInlineMediaInSocialLayout } from "./social-media-layout-utils"

describe("shouldDisableInlineMediaInSocialLayout", () => {
  it("显式 noMedia 时应禁用正文内媒体", () => {
    expect(
      shouldDisableInlineMediaInSocialLayout({
        noMedia: true,
        mediaCount: 0,
      }),
    ).toBe(true)
  })

  it("存在结构化媒体时应禁用正文内媒体避免重复", () => {
    expect(
      shouldDisableInlineMediaInSocialLayout({
        noMedia: false,
        mediaCount: 2,
      }),
    ).toBe(true)
  })

  it("无结构化媒体时应允许正文内图片渲染", () => {
    expect(
      shouldDisableInlineMediaInSocialLayout({
        noMedia: false,
        mediaCount: 0,
      }),
    ).toBe(false)
  })
})
