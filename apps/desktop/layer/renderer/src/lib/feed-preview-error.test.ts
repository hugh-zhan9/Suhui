import { describe, expect, it } from "vitest"

import { getFeedPreviewFriendlyMessage, parseFeedPreviewError } from "./feed-preview-error"

const wrap = (url: string, reason: string) =>
  `本地预览订阅失败: Error invoking remote method 'db.previewFeed': Error: [db.previewFeed] failed for ${url}: ${reason}`

describe("parseFeedPreviewError", () => {
  it("应把 404 预览失败翻译成地址不存在，并保留原始原因与地址", () => {
    const info = parseFeedPreviewError(
      wrap("https://imjuya.github.io/juya-ai-daily/rss.xml", "HTTP 404"),
    )

    expect(info).toEqual({
      type: "not_found",
      title: "订阅源地址不存在（HTTP 404）",
      hint: "请检查网址是否输入正确，或该订阅源是否已经下线。",
      detail: "HTTP 404",
      url: "https://imjuya.github.io/juya-ai-daily/rss.xml",
    })
  })

  it("应按状态码区分拒绝访问、限流与源站异常", () => {
    expect(parseFeedPreviewError(wrap("https://example.com/feed", "HTTP 403"))?.type).toBe(
      "forbidden",
    )
    expect(parseFeedPreviewError(wrap("https://example.com/feed", "HTTP 429"))?.type).toBe(
      "rate_limited",
    )
    expect(parseFeedPreviewError(wrap("https://example.com/feed", "HTTP 503"))?.type).toBe(
      "server_error",
    )
    expect(parseFeedPreviewError(wrap("https://example.com/feed", "HTTP 418"))?.type).toBe(
      "http_error",
    )
  })

  it("应识别网络类错误", () => {
    expect(
      parseFeedPreviewError(wrap("https://example.com/feed", "net::ERR_NAME_NOT_RESOLVED"))?.type,
    ).toBe("dns")
    expect(
      parseFeedPreviewError(wrap("https://example.com/feed", "net::ERR_CONNECTION_REFUSED"))?.type,
    ).toBe("connection")
    expect(
      parseFeedPreviewError(wrap("https://example.com/feed", "net::ERR_CERT_DATE_INVALID"))?.type,
    ).toBe("tls")
    expect(
      parseFeedPreviewError(
        wrap("https://example.com/feed", "Feed request timed out after 30000ms"),
      )?.type,
    ).toBe("timeout")
    expect(
      parseFeedPreviewError(wrap("https://example.com/feed", "Too many redirects"))?.type,
    ).toBe("redirect")
  })

  it("应识别不是订阅源的地址", () => {
    expect(parseFeedPreviewError(wrap("https://example.com", "Invalid feed XML"))?.type).toBe(
      "invalid_feed",
    )
    expect(
      parseFeedPreviewError(wrap("https://example.com", "Unsupported feed format"))?.type,
    ).toBe("invalid_feed")
  })

  it("非预览链路的错误不应被改写", () => {
    expect(parseFeedPreviewError("HTTP 404")).toBeNull()
    expect(parseFeedPreviewError("")).toBeNull()
    expect(getFeedPreviewFriendlyMessage("HTTP 404")).toBe("HTTP 404")
  })

  it("预览链路里无法识别的原因应保持原样", () => {
    const raw = wrap("https://example.com/feed", "something totally unexpected")
    expect(parseFeedPreviewError(raw)).toBeNull()
    expect(getFeedPreviewFriendlyMessage(raw)).toBe(raw)
  })

  it("友好文案应同时给出原因与下一步", () => {
    expect(
      getFeedPreviewFriendlyMessage(
        wrap("https://imjuya.github.io/juya-ai-daily/rss.xml", "HTTP 404"),
      ),
    ).toBe("订阅源地址不存在（HTTP 404）。请检查网址是否输入正确，或该订阅源是否已经下线。")
  })
})

describe("自动发现失败提示", () => {
  it("发现与抓取都失败时不再提示『请填写订阅地址』", () => {
    const info = parseFeedPreviewError(
      "本地预览订阅失败: Error invoking remote method 'db.previewFeed': Error: [db.previewFeed] failed for https://example.com/news: FEED_DISCOVERY_FAILED: https://example.com/news has no discoverable feed (4 candidates checked, scrape rejected: NO_RELIABLE_DATES)",
    )

    expect(info?.type).toBe("no_feed_discovered")
    expect(info?.title).toBe("该网页没有可用的订阅源")
    expect(info?.hint).not.toContain("请确认填写的是订阅地址")
    expect(info?.url).toBe("https://example.com/news")
  })

  it("普通订阅源格式错误仍保持原有提示", () => {
    const info = parseFeedPreviewError(
      "本地预览订阅失败: [db.previewFeed] failed for https://example.com/a.json: Invalid feed XML",
    )

    expect(info?.type).toBe("invalid_feed")
  })
})

describe("订阅提交链路的报错", () => {
  it("翻译 db.addFeed 的连接被关闭错误，而不是透出原始 net:: 码", () => {
    const info = parseFeedPreviewError(
      "Error invoking remote method 'db.addFeed': Error: Failed to add feed: net::ERR_CONNECTION_CLOSED",
    )

    expect(info).not.toBeNull()
    expect(info?.type).toBe("connection")
    expect(info?.title).not.toContain("net::")
    expect(info?.detail).toBe("net::ERR_CONNECTION_CLOSED")
  })

  it("db.addFeed 的 HTTP 错误同样按既有口径分类", () => {
    const info = parseFeedPreviewError(
      "Error invoking remote method 'db.addFeed': Error: Failed to add feed: HTTP 404",
    )

    expect(info?.type).toBe("not_found")
  })

  it("db.addFeed 命中发现失败时给出对应提示", () => {
    const info = parseFeedPreviewError(
      "Error invoking remote method 'db.addFeed': Error: Failed to add feed: FEED_DISCOVERY_FAILED: https://example.com/ has no discoverable feed",
    )

    expect(info?.type).toBe("no_feed_discovered")
  })
})
