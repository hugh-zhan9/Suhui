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
