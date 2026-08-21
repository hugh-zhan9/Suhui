import { describe, expect, it } from "vitest"

import { assessFeedStaleness } from "./feed-staleness"

const at = (iso: string) => Date.parse(iso)

describe("assessFeedStaleness", () => {
  it("订阅源缺少页面最新文章且落后很久时判定为陈旧", () => {
    const result = assessFeedStaleness({
      feedItems: [
        {
          url: "https://lexburner.github.io/netty-persistent-connection/",
          publishedAt: at("2021-03-28"),
        },
        { url: "https://lexburner.github.io/nacos-service-model/", publishedAt: at("2021-03-14") },
      ],
      pageArticles: [
        { url: "https://www.cnkirito.moe/ai-200usd-sub-md/", publishedAt: at("2026-05-21") },
        { url: "https://www.cnkirito.moe/ai-agents-md-practise/", publishedAt: at("2026-04-19") },
      ],
    })

    expect(result.stale).toBe(true)
    expect(result.reason).toBe("FEED_MISSING_NEWEST_PAGE_ARTICLE")
    expect(result.lagDays).toBe(1880)
  })

  it("换域名后仍按路径识别同一篇文章，不误判为陈旧", () => {
    const result = assessFeedStaleness({
      feedItems: [
        { url: "https://old-domain.github.io/latest-post/", publishedAt: at("2020-01-01") },
      ],
      pageArticles: [{ url: "https://new-domain.com/latest-post", publishedAt: at("2026-05-21") }],
    })

    expect(result.stale).toBe(false)
    expect(result.reason).toBeNull()
  })

  it("落后天数低于阈值时不判定为陈旧", () => {
    const result = assessFeedStaleness({
      feedItems: [{ url: "https://example.com/a", publishedAt: at("2026-05-01") }],
      pageArticles: [{ url: "https://example.com/b", publishedAt: at("2026-05-20") }],
    })

    expect(result.stale).toBe(false)
    expect(result.lagDays).toBe(19)
  })

  it("阈值可调", () => {
    const args = {
      feedItems: [{ url: "https://example.com/a", publishedAt: at("2026-05-01") }],
      pageArticles: [{ url: "https://example.com/b", publishedAt: at("2026-05-20") }],
    }

    expect(assessFeedStaleness({ ...args, minLagDays: 10 }).stale).toBe(true)
  })

  it("任一侧缺少日期时判定为无法确定，不猜测", () => {
    expect(
      assessFeedStaleness({
        feedItems: [{ url: "https://example.com/a", publishedAt: 0 }],
        pageArticles: [{ url: "https://example.com/b", publishedAt: at("2026-05-20") }],
      }),
    ).toEqual({ stale: false, lagDays: null, reason: null })

    expect(
      assessFeedStaleness({
        feedItems: [{ url: "https://example.com/a", publishedAt: at("2020-01-01") }],
        pageArticles: [],
      }),
    ).toEqual({ stale: false, lagDays: null, reason: null })
  })

  it("订阅源比页面更新时不判定为陈旧", () => {
    const result = assessFeedStaleness({
      feedItems: [{ url: "https://example.com/new", publishedAt: at("2026-05-20") }],
      pageArticles: [{ url: "https://example.com/old", publishedAt: at("2026-01-01") }],
    })

    expect(result.stale).toBe(false)
    expect(result.lagDays).toBeLessThan(0)
  })

  it("忽略尾部斜杠与大小写差异", () => {
    const result = assessFeedStaleness({
      feedItems: [{ url: "https://example.com/Post-A/", publishedAt: at("2020-01-01") }],
      pageArticles: [{ url: "https://example.com/post-a", publishedAt: at("2026-05-21") }],
    })

    expect(result.stale).toBe(false)
  })
})
