import { describe, expect, it } from "vitest"

import { discoverFeedCandidates, isPrivateNetworkHost, looksLikeHtml } from "./feed-discovery"

const page = (body: string, head = "") =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

describe("discoverFeedCandidates", () => {
  it("优先采用 head 中的 rel=alternate 自动发现标签", () => {
    const html = page(
      "",
      `<link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml">
       <link rel="alternate" type="application/atom+xml" href="https://cdn.example.com/atom.xml">`,
    )

    expect(discoverFeedCandidates(html, "https://example.com/blog")).toEqual([
      { url: "https://example.com/rss.xml", source: "link-tag", title: "RSS" },
      { url: "https://cdn.example.com/atom.xml", source: "link-tag", title: undefined },
    ])
  })

  it("忽略 rel=alternate 但类型不是订阅源的标签", () => {
    const html = page(
      "",
      `<link rel="alternate" hreflang="en" type="text/html" href="/en/">
       <link rel="stylesheet" type="text/css" href="/a.css">`,
    )

    // nothing advertised, so only the guessed common paths remain
    expect(
      discoverFeedCandidates(html, "https://example.com/").every(
        (item) => item.source === "common-path",
      ),
    ).toBe(true)
  })

  it("命中页面里手写的订阅链接（无自动发现标签时的常见情形）", () => {
    const html = page(`<a title="RSS" href="/atom.xml"><i class="fas fa-rss"></i></a>`)
    const candidates = discoverFeedCandidates(html, "https://www.cnkirito.moe/")

    expect(candidates).toContainEqual({
      url: "https://www.cnkirito.moe/atom.xml",
      source: "anchor",
    })
  })

  it("按 generator 指纹补充该生成器的默认路径", () => {
    const html = page("", `<meta name="generator" content="Hexo 5.4.0">`)
    const urls = discoverFeedCandidates(html, "https://example.com/").map((item) => item.url)

    expect(urls).toEqual([
      "https://example.com/atom.xml",
      "https://example.com/rss2.xml",
      "https://example.com/feed.xml",
    ])
  })

  it("为不公开订阅源的平台补充硬规则", () => {
    expect(
      discoverFeedCandidates(page(""), "https://github.com/electron/electron").map((i) => i.url),
    ).toEqual([
      "https://github.com/electron/electron/releases.atom",
      "https://github.com/electron/electron/commits.atom",
    ])

    expect(
      discoverFeedCandidates(page(""), "https://www.youtube.com/channel/UC123").map((i) => i.url),
    ).toEqual(["https://www.youtube.com/feeds/videos.xml?channel_id=UC123"])
  })

  it("仅在页面未声明任何候选时才穷举通用路径", () => {
    const bare = discoverFeedCandidates(page(""), "https://example.com/")
    expect(bare.every((item) => item.source === "common-path")).toBe(true)
    expect(bare.map((item) => item.url)).toContain("https://example.com/atom.xml")

    const advertised = discoverFeedCandidates(
      page("", `<link rel="alternate" type="application/rss+xml" href="/rss.xml">`),
      "https://example.com/",
    )
    expect(advertised.some((item) => item.source === "common-path")).toBe(false)
  })

  it("去重相同候选并保持精度优先的排序", () => {
    const html = page(
      `<a href="/atom.xml">RSS 订阅</a>`,
      `<link rel="alternate" type="application/atom+xml" href="/atom.xml">`,
    )
    const candidates = discoverFeedCandidates(html, "https://example.com/")

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.source).toBe("link-tag")
  })

  it("跳过非 http(s) 协议的候选", () => {
    const html = page(
      "",
      `<link rel="alternate" type="application/rss+xml" href="javascript:void(0)">`,
    )
    const candidates = discoverFeedCandidates(html, "https://example.com/")

    expect(candidates.some((item) => item.source === "link-tag")).toBe(false)
    expect(candidates.every((item) => item.url.startsWith("https://example.com/"))).toBe(true)
  })
})

describe("looksLikeHtml", () => {
  it("按 content-type 判定网页", () => {
    expect(looksLikeHtml("<html></html>", "text/html; charset=utf-8")).toBe(true)
  })

  it("无 content-type 时按文档起始判定", () => {
    expect(looksLikeHtml("<!DOCTYPE html><html>")).toBe(true)
    expect(looksLikeHtml('<?xml version="1.0"?><feed></feed>')).toBe(false)
    expect(looksLikeHtml('<?xml version="1.0"?><rss version="2.0">')).toBe(false)
  })

  it("不把订阅源文档误判为网页", () => {
    expect(
      looksLikeHtml('<rss version="2.0"><channel></channel></rss>', "application/rss+xml"),
    ).toBe(false)
  })
})

describe("候选地址的网络边界", () => {
  it("拒绝页面把请求指向本机、内网与链路本地地址", () => {
    const html = page(
      `<a href="http://10.0.0.5:8080/atom.xml">RSS</a>`,
      `<link rel="alternate" type="application/xml" href="http://127.0.0.1:9200/_cat/indices?feed">
       <link rel="alternate" type="application/rss+xml" href="http://192.168.1.1/rss">
       <link rel="alternate" type="text/xml" href="http://169.254.169.254/latest/meta-data/">
       <link rel="alternate" type="application/rss+xml" href="http://localhost:3000/feed">
       <link rel="alternate" type="application/rss+xml" href="https://feeds.example.net/rss.xml">`,
    )

    expect(
      discoverFeedCandidates(html, "https://blog.example.com/").map((item) => item.url),
    ).toEqual(["https://feeds.example.net/rss.xml"])
  })

  it("允许指回页面自身主机，便于订阅内网站点", () => {
    const html = page(
      "",
      `<link rel="alternate" type="application/rss+xml" href="http://192.168.1.10/feed.xml">`,
    )

    expect(
      discoverFeedCandidates(html, "http://192.168.1.10/blog").map((item) => item.url),
    ).toEqual(["http://192.168.1.10/feed.xml"])
  })

  it("substack 规则不匹配仿冒域名", () => {
    expect(
      discoverFeedCandidates(page(""), "https://notsubstack.com/x").every(
        (i) => i.source === "common-path",
      ),
    ).toBe(true)
  })
})

describe("isPrivateNetworkHost", () => {
  it.each([
    "localhost",
    "printer.local",
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
  ])("%s 判定为内网", (host) => {
    expect(isPrivateNetworkHost(host)).toBe(true)
  })

  it.each(["example.com", "8.8.8.8", "172.32.0.1", "192.169.0.1", "2606:4700::1111"])(
    "%s 判定为公网",
    (host) => {
      expect(isPrivateNetworkHost(host)).toBe(false)
    },
  )
})
