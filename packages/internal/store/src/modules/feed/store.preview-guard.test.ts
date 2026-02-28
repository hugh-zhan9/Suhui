import { describe, expect, it } from "vitest"

import { shouldReturnExistingFeedDirectly, shouldSkipIdOnlyPreview } from "./store"

describe("shouldSkipIdOnlyPreview", () => {
  it("仅有远端 feedId 且本地无缓存时，应跳过本地预览", () => {
    expect(
      shouldSkipIdOnlyPreview({
        id: "1712546615000",
        url: undefined,
        hasExisting: false,
      }),
    ).toBe(true)
  })

  it("存在 url 时，不应跳过预览", () => {
    expect(
      shouldSkipIdOnlyPreview({
        id: "1712546615000",
        url: "https://example.com/rss.xml",
        hasExisting: false,
      }),
    ).toBe(false)
  })

  it("本地已有 feed 缓存时，不应跳过预览", () => {
    expect(
      shouldSkipIdOnlyPreview({
        id: "1712546615000",
        url: undefined,
        hasExisting: true,
      }),
    ).toBe(false)
  })
})

describe("shouldReturnExistingFeedDirectly", () => {
  it("已有 feed 且本地已有条目缓存时应直接返回", () => {
    expect(
      shouldReturnExistingFeedDirectly({
        existing: { url: "https://example.com/rss.xml" },
        hasEntryCache: true,
      }),
    ).toBe(true)
  })

  it("已有 feed 但无 url 时应直接返回", () => {
    expect(
      shouldReturnExistingFeedDirectly({
        existing: { url: "" },
        hasEntryCache: false,
      }),
    ).toBe(true)
  })

  it("已有 feed 且有 url 但无条目缓存时不应直接返回", () => {
    expect(
      shouldReturnExistingFeedDirectly({
        existing: { url: "https://example.com/rss.xml" },
        hasEntryCache: false,
      }),
    ).toBe(false)
  })
})
