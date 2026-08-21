import { describe, expect, it } from "vitest"

import {
  buildSiteScrapeUrl,
  isSiteScrapeUrl,
  parseSiteScrapeUrl,
  resolveFeedSourceTarget,
} from "./site-scrape-url"

describe("site-scrape-url", () => {
  it("在 sitescrape 地址中完整保留目标页面地址", () => {
    const built = buildSiteScrapeUrl("https://www.cnkirito.moe/news?page=2")

    expect(built).toBe("sitescrape:https://www.cnkirito.moe/news?page=2")
    expect(parseSiteScrapeUrl(built)).toBe("https://www.cnkirito.moe/news?page=2")
  })

  it("保留 http 目标，不强制升级为 https", () => {
    expect(parseSiteScrapeUrl(buildSiteScrapeUrl("http://example.com/blog"))).toBe(
      "http://example.com/blog",
    )
  })

  it("拒绝非 http(s) 的抓取目标", () => {
    expect(() => buildSiteScrapeUrl("file:///etc/passwd")).toThrow(/Unsupported site scrape target/)
    expect(parseSiteScrapeUrl("sitescrape:file:///etc/passwd")).toBeNull()
    expect(parseSiteScrapeUrl("sitescrape:not-a-url")).toBeNull()
  })

  it("识别 sitescrape 前缀且忽略大小写与首尾空白", () => {
    expect(isSiteScrapeUrl("  SITESCRAPE:https://example.com/  ")).toBe(true)
    expect(isSiteScrapeUrl("https://example.com/atom.xml")).toBe(false)
  })

  it("普通订阅地址原样透传为 feed 模式", () => {
    expect(resolveFeedSourceTarget("https://example.com/atom.xml")).toEqual({
      mode: "feed",
      requestUrl: "https://example.com/atom.xml",
    })
    expect(resolveFeedSourceTarget("rsshub://github/issue/vuejs/core")).toEqual({
      mode: "feed",
      requestUrl: "rsshub://github/issue/vuejs/core",
    })
  })

  it("sitescrape 地址解析为 scrape 模式与真实请求地址", () => {
    expect(resolveFeedSourceTarget("sitescrape:https://example.com/blog")).toEqual({
      mode: "scrape",
      requestUrl: "https://example.com/blog",
    })
  })
})
