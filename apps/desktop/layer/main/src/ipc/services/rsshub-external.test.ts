import { describe, expect, it } from "vitest"

import { resolvePreviewFeedUrl } from "./rsshub-external"

describe("resolvePreviewFeedUrl", () => {
  it("未配置外部 RSSHub 时应抛结构化错误", () => {
    expect(() => resolvePreviewFeedUrl("rsshub://github/trending", {})).toThrowError(
      /RSSHUB_EXTERNAL_UNCONFIGURED/,
    )
  })

  it("配置外部 RSSHub 时应改写到自定义地址", () => {
    expect(
      resolvePreviewFeedUrl("rsshub://github/trending?since=daily", {
        customBaseUrl: "https://rsshub.myself.dev",
      }),
    ).toBe("https://rsshub.myself.dev/github/trending?since=daily")
  })

  it("允许官方默认回退时应使用 rsshub.app", () => {
    expect(
      resolvePreviewFeedUrl("https://rsshub.app/github/trending", {
        allowPublicFallback: true,
      }),
    ).toBe("https://rsshub.app/github/trending")
  })
})
