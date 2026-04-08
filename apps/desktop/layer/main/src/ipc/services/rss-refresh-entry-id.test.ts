import { describe, expect, it } from "vitest"

import {
  buildEntryIdentityKey,
  buildEntryTitlePublishedKey,
  buildExistingEntryReuseIndex,
  buildStableLocalEntryId,
  resolveExistingEntryIdForRefresh,
} from "./rss-refresh"

describe("buildStableLocalEntryId", () => {
  it("同一 feed + guid 生成稳定且一致的 id", () => {
    const a = buildStableLocalEntryId({
      feedId: "feed_1",
      guid: "https://example.com/post/1",
      url: null,
      title: "Post 1",
      publishedAt: 1730000000000,
    })
    const b = buildStableLocalEntryId({
      feedId: "feed_1",
      guid: "https://example.com/post/1",
      url: null,
      title: "Post 1",
      publishedAt: 1730000000000,
    })

    expect(a).toBe(b)
  })

  it("不同 feed 上相同 guid 不应冲突", () => {
    const a = buildStableLocalEntryId({
      feedId: "feed_1",
      guid: "same-guid",
      url: null,
      title: "Post",
      publishedAt: 1730000000000,
    })
    const b = buildStableLocalEntryId({
      feedId: "feed_2",
      guid: "same-guid",
      url: null,
      title: "Post",
      publishedAt: 1730000000000,
    })

    expect(a).not.toBe(b)
  })
})

describe("buildEntryIdentityKey", () => {
  it("优先使用 guid 作为身份键，支持刷新时复用既有条目状态", () => {
    const key = buildEntryIdentityKey({
      guid: "https://example.com/post/1",
      url: "https://example.com/alt",
      title: "Post 1",
      publishedAt: 1730000000000,
    })
    expect(key).toBe("guid:https://example.com/post/1")
  })
})

describe("buildEntryTitlePublishedKey", () => {
  it("仅在标题和发布时间都有效时生成回退键", () => {
    expect(
      buildEntryTitlePublishedKey({
        title: "  同一篇文章  ",
        publishedAt: 1730000000000,
      }),
    ).toBe("tp:同一篇文章|1730000000000")

    expect(
      buildEntryTitlePublishedKey({
        title: "同一篇文章",
        publishedAt: 0,
      }),
    ).toBeNull()
  })
})

describe("resolveExistingEntryIdForRefresh", () => {
  it("guid/url 改变但标题与发布时间相同时，复用较新的既有条目", () => {
    const reuseIndex = buildExistingEntryReuseIndex([
      {
        id: "entry_old",
        guid: "https://example.com/old-slug",
        url: "https://example.com/old-slug",
        title: "同一篇文章",
        publishedAt: 1730000000000,
        insertedAt: 10,
        read: false,
      },
      {
        id: "entry_new",
        guid: "https://example.com/new-slug",
        url: "https://example.com/new-slug",
        title: "同一篇文章",
        publishedAt: 1730000000000,
        insertedAt: 20,
        read: true,
      },
    ])

    expect(
      resolveExistingEntryIdForRefresh(reuseIndex, {
        guid: "https://example.com/final-slug",
        url: "https://example.com/final-slug",
        title: "同一篇文章",
        publishedAt: 1730000000000,
      }),
    ).toBe("entry_new")
    expect(reuseIndex.readById.get("entry_new")).toBe(true)
  })

  it("命中原始 guid 时优先复用精确身份键，不回退到标题时间匹配", () => {
    const reuseIndex = buildExistingEntryReuseIndex([
      {
        id: "entry_exact",
        guid: "https://example.com/post",
        url: "https://example.com/post",
        title: "同一篇文章",
        publishedAt: 1730000000000,
        insertedAt: 10,
        read: false,
      },
      {
        id: "entry_newer_same_title",
        guid: "https://example.com/post-renamed",
        url: "https://example.com/post-renamed",
        title: "同一篇文章",
        publishedAt: 1730000000000,
        insertedAt: 20,
        read: true,
      },
    ])

    expect(
      resolveExistingEntryIdForRefresh(reuseIndex, {
        guid: "https://example.com/post",
        url: "https://example.com/post",
        title: "同一篇文章",
        publishedAt: 1730000000000,
      }),
    ).toBe("entry_exact")
  })
})
