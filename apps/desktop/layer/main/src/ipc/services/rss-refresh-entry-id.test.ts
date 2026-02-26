import { describe, expect, it } from 'vitest'

import { buildEntryIdentityKey, buildStableLocalEntryId } from './rss-refresh'

describe('buildStableLocalEntryId', () => {
  it('同一 feed + guid 生成稳定且一致的 id', () => {
    const a = buildStableLocalEntryId({
      feedId: 'feed_1',
      guid: 'https://example.com/post/1',
      url: null,
      title: 'Post 1',
      publishedAt: 1730000000000,
    })
    const b = buildStableLocalEntryId({
      feedId: 'feed_1',
      guid: 'https://example.com/post/1',
      url: null,
      title: 'Post 1',
      publishedAt: 1730000000000,
    })

    expect(a).toBe(b)
  })

  it('不同 feed 上相同 guid 不应冲突', () => {
    const a = buildStableLocalEntryId({
      feedId: 'feed_1',
      guid: 'same-guid',
      url: null,
      title: 'Post',
      publishedAt: 1730000000000,
    })
    const b = buildStableLocalEntryId({
      feedId: 'feed_2',
      guid: 'same-guid',
      url: null,
      title: 'Post',
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
