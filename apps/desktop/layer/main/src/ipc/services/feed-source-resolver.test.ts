import { describe, expect, it, vi } from "vitest"

import {
  DISCOVERY_BUDGET_MS,
  FEED_DISCOVERY_FAILED,
  MAX_DISCOVERY_CANDIDATES,
  resolveFeedDocument,
} from "./feed-source-resolver"

const atomFeed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Verne in GitHub</title>
  <link href="https://blog.example.com/" rel="alternate" />
  <entry>
    <title>Entry 1</title>
    <link href="https://blog.example.com/post/1" rel="alternate" />
    <id>entry-1</id>
    <updated>2026-04-08T00:00:00Z</updated>
    <content type="html">hello</content>
  </entry>
</feed>`

const emptyFeed = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`

const listingPage = `<!doctype html><html><head><title>Example Blog</title></head><body>
  <main>
    <li class="p"><a href="/a/">First Real Article</a><time datetime="2026-01-03">x</time></li>
    <li class="p"><a href="/b/">Second Real Article</a><time datetime="2026-01-02">x</time></li>
    <li class="p"><a href="/c/">Third Real Article</a><time datetime="2026-01-01">x</time></li>
  </main>
</body></html>`

const advertisingPage = `<!doctype html><html><head><title>Example Blog</title>
  <link rel="alternate" type="application/atom+xml" href="/atom.xml"></head>
  <body><main><p>hello</p></main></body></html>`

describe("resolveFeedDocument", () => {
  it("订阅源文档直接解析，且不做任何额外探测", async () => {
    const fetchCandidate = vi.fn()

    const result = await resolveFeedDocument({
      mode: "feed",
      requestUrl: "https://blog.example.com/atom.xml",
      body: atomFeed,
      contentType: "application/atom+xml",
      fetchCandidate,
    })

    expect(result.source).toBe("direct")
    expect(result.feedUrl).toBe("https://blog.example.com/atom.xml")
    expect(result.parsed.items).toHaveLength(1)
    expect(fetchCandidate).not.toHaveBeenCalled()
  })

  it("网页声明了订阅源时改用发现到的地址", async () => {
    const fetchCandidate = vi.fn().mockResolvedValue({ body: atomFeed })

    const result = await resolveFeedDocument({
      mode: "feed",
      requestUrl: "https://blog.example.com/",
      body: advertisingPage,
      contentType: "text/html",
      fetchCandidate,
    })

    expect(result.source).toBe("discovered")
    expect(result.discoveredVia).toBe("link-tag")
    expect(result.feedUrl).toBe("https://blog.example.com/atom.xml")
    expect(fetchCandidate).toHaveBeenCalledWith("https://blog.example.com/atom.xml")
  })

  it("跳过抓取失败与空订阅源候选，改用后续候选", async () => {
    const fetchCandidate = vi.fn(async (url: string) => {
      if (url.endsWith("/atom.xml")) throw new Error("HTTP 404")
      if (url.endsWith("/feed")) return { body: emptyFeed }
      return { body: atomFeed }
    })

    const result = await resolveFeedDocument({
      mode: "feed",
      requestUrl: "https://blog.example.com/",
      body: `<!doctype html><html><body><main><p>x</p></main></body></html>`,
      contentType: "text/html",
      fetchCandidate,
    })

    expect(result.source).toBe("discovered")
    expect(result.feedUrl).toBe("https://blog.example.com/rss.xml")
  })

  it("找不到订阅源但页面可抓取时生成 sitescrape 源", async () => {
    const fetchCandidate = vi.fn().mockRejectedValue(new Error("HTTP 404"))

    const result = await resolveFeedDocument({
      mode: "feed",
      requestUrl: "https://blog.example.com/",
      body: listingPage,
      contentType: "text/html",
      fetchCandidate,
    })

    expect(result.source).toBe("scraped")
    expect(result.feedUrl).toBe("sitescrape:https://blog.example.com/")
    expect(result.parsed.title).toBe("Example Blog")
    expect(result.parsed.items.map((item) => item.url)).toEqual([
      "https://blog.example.com/a/",
      "https://blog.example.com/b/",
      "https://blog.example.com/c/",
    ])
  })

  it("既无订阅源又无法可靠抓取时明确失败", async () => {
    const fetchCandidate = vi.fn().mockRejectedValue(new Error("HTTP 404"))
    const navOnly = `<!doctype html><html><body><main><div>
      <a class="t" href="/x">Mythos</a><a class="t" href="/y">Fable</a><a class="t" href="/z">Opus</a>
    </div></main></body></html>`

    await expect(
      resolveFeedDocument({
        mode: "feed",
        requestUrl: "https://example.com/news",
        body: navOnly,
        contentType: "text/html",
        fetchCandidate,
      }),
    ).rejects.toThrow(new RegExp(`${FEED_DISCOVERY_FAILED}.*NO_RELIABLE_DATES`))
  })

  it("响应不是网页时原样抛出解析错误，保持既有报错口径", async () => {
    const fetchCandidate = vi.fn()

    await expect(
      resolveFeedDocument({
        mode: "feed",
        requestUrl: "https://example.com/data.json",
        body: `{"items": []}`,
        contentType: "application/json",
        fetchCandidate,
      }),
    ).rejects.toThrow("Invalid feed XML")
    expect(fetchCandidate).not.toHaveBeenCalled()
  })

  it("探测候选数量有上限", async () => {
    const fetchCandidate = vi.fn().mockResolvedValue({ body: "<html></html>" })
    const manyLinks = `<!doctype html><html><head>${Array.from(
      { length: 20 },
      (_, index) => `<link rel="alternate" type="application/rss+xml" href="/f${index}.xml">`,
    ).join("")}</head><body><main><p>x</p></main></body></html>`

    await expect(
      resolveFeedDocument({
        mode: "feed",
        requestUrl: "https://example.com/",
        body: manyLinks,
        contentType: "text/html",
        fetchCandidate,
      }),
    ).rejects.toThrow(FEED_DISCOVERY_FAILED)

    expect(fetchCandidate).toHaveBeenCalledTimes(MAX_DISCOVERY_CANDIDATES)
  })

  it("scrape 模式直接把响应当文章列表读取，不再尝试解析订阅源", async () => {
    const fetchCandidate = vi.fn()

    const result = await resolveFeedDocument({
      mode: "scrape",
      requestUrl: "https://blog.example.com/",
      body: listingPage,
      contentType: "text/html",
      fetchCandidate,
    })

    expect(result.source).toBe("scraped")
    expect(result.feedUrl).toBe("sitescrape:https://blog.example.com/")
    expect(result.parsed.items).toHaveLength(3)
    expect(fetchCandidate).not.toHaveBeenCalled()
  })

  it("scrape 模式下页面结构失效时报明确错误", async () => {
    await expect(
      resolveFeedDocument({
        mode: "scrape",
        requestUrl: "https://blog.example.com/",
        body: `<html><body><main><p>页面改版了</p></main></body></html>`,
        contentType: "text/html",
        fetchCandidate: vi.fn(),
      }),
    ).rejects.toThrow(new RegExp(`${FEED_DISCOVERY_FAILED}.*NO_REPEATED_LINK_GROUP`))
  })
})

describe("陈旧订阅源的双选项", () => {
  const staleFeed = `<?xml version="1.0"?><rss version="2.0"><channel><title>徐靖峰|个人博客</title>
    <item><title>Netty 长连接</title><link>https://lexburner.github.io/netty/</link>
      <pubDate>Sun, 28 Mar 2021 06:59:28 GMT</pubDate></item>
    <item><title>Nacos 服务模型</title><link>https://lexburner.github.io/nacos/</link>
      <pubDate>Sun, 14 Mar 2021 06:59:28 GMT</pubDate></item>
  </channel></rss>`

  const freshPage = `<!doctype html><html><head><title>徐靖峰|个人博客</title>
    <link rel="alternate" type="application/rss+xml" href="/atom.xml"></head><body><main>
    <article class="card"><h2><a href="/ai-200usd-sub-md/">我的 200 美元 AI 订阅方案</a></h2>
      <time datetime="2026-05-21">2026-05-21</time></article>
    <article class="card"><h2><a href="/ai-agents-md-practise/">AGENTS.md 实践指南</a></h2>
      <time datetime="2026-04-19">2026-04-19</time></article>
    <article class="card"><h2><a href="/qoder-blog-build-practise/">从 Qoder 搭建博客服务器聊起</a></h2>
      <time datetime="2026-03-23">2026-03-23</time></article>
  </main></body></html>`

  it("发现到的订阅源已停更时，默认给出页面抓取结果", async () => {
    const result = await resolveFeedDocument({
      mode: "feed",
      requestUrl: "https://www.cnkirito.moe/",
      body: freshPage,
      contentType: "text/html",
      fetchCandidate: vi.fn().mockResolvedValue({ body: staleFeed }),
    })

    expect(result.source).toBe("scraped")
    expect(result.feedUrl).toBe("sitescrape:https://www.cnkirito.moe/")
    expect(result.parsed.items[0]!.title).toBe("我的 200 美元 AI 订阅方案")
  })

  it("同时把停更的订阅源作为备选项返回，供订阅前选择", async () => {
    const result = await resolveFeedDocument({
      mode: "feed",
      requestUrl: "https://www.cnkirito.moe/",
      body: freshPage,
      contentType: "text/html",
      fetchCandidate: vi.fn().mockResolvedValue({ body: staleFeed }),
    })

    expect(result.sourceOptions.active).toMatchObject({
      url: "sitescrape:https://www.cnkirito.moe/",
      kind: "scraped",
      itemCount: 3,
    })
    expect(result.sourceOptions.alternatives).toEqual([
      {
        url: "https://www.cnkirito.moe/atom.xml",
        kind: "feed",
        itemCount: 2,
        newestPublishedAt: Date.parse("Sun, 28 Mar 2021 06:59:28 GMT"),
      },
    ])
    expect(result.sourceOptions.staleLagDays).toBe(1879)
  })

  it("订阅源仍在跟进站点时不提供备选项", async () => {
    const freshFeed = staleFeed.replace(
      "Sun, 28 Mar 2021 06:59:28 GMT",
      "Thu, 21 May 2026 00:00:00 GMT",
    )

    const result = await resolveFeedDocument({
      mode: "feed",
      requestUrl: "https://www.cnkirito.moe/",
      body: freshPage,
      contentType: "text/html",
      fetchCandidate: vi.fn().mockResolvedValue({ body: freshFeed }),
    })

    expect(result.source).toBe("discovered")
    expect(result.feedUrl).toBe("https://www.cnkirito.moe/atom.xml")
    expect(result.sourceOptions.alternatives).toEqual([])
    expect(result.sourceOptions.staleLagDays).toBeUndefined()
  })

  it("订阅源停更但页面也抓不出列表时，仍然保留订阅源", async () => {
    const unscrapeablePage = `<!doctype html><html><head>
      <link rel="alternate" type="application/rss+xml" href="/atom.xml"></head>
      <body><main><p>没有文章列表</p></main></body></html>`

    const result = await resolveFeedDocument({
      mode: "feed",
      requestUrl: "https://www.cnkirito.moe/",
      body: unscrapeablePage,
      contentType: "text/html",
      fetchCandidate: vi.fn().mockResolvedValue({ body: staleFeed }),
    })

    expect(result.source).toBe("discovered")
    expect(result.sourceOptions.alternatives).toEqual([])
  })

  it("显式订阅 sitescrape 地址时只描述当前来源", async () => {
    const result = await resolveFeedDocument({
      mode: "scrape",
      requestUrl: "https://www.cnkirito.moe/",
      body: freshPage,
      contentType: "text/html",
      fetchCandidate: vi.fn(),
    })

    expect(result.sourceOptions.active.kind).toBe("scraped")
    expect(result.sourceOptions.alternatives).toEqual([])
  })

  it("显式订阅订阅源地址时只描述当前来源", async () => {
    const result = await resolveFeedDocument({
      mode: "feed",
      requestUrl: "https://www.cnkirito.moe/atom.xml",
      body: staleFeed,
      contentType: "application/rss+xml",
      fetchCandidate: vi.fn(),
    })

    expect(result.source).toBe("direct")
    expect(result.sourceOptions.active).toMatchObject({ kind: "feed", itemCount: 2 })
    expect(result.sourceOptions.alternatives).toEqual([])
  })
})

describe("刷新既有订阅时不做发现与抓取", () => {
  const parkedPage = `<!doctype html><html><head><title>Domain suspended</title></head><body><main>
    <li class="p"><a href="/a/">Buy this domain now</a><time datetime="2026-08-07">x</time></li>
    <li class="p"><a href="/b/">Related searches here</a><time datetime="2026-08-06">x</time></li>
    <li class="p"><a href="/c/">Sponsored listings here</a><time datetime="2026-08-05">x</time></li>
  </main></body></html>`

  it("订阅源地址开始返回网页时，报错而不是改用网页内容", async () => {
    const fetchCandidate = vi.fn()

    await expect(
      resolveFeedDocument({
        mode: "feed",
        requestUrl: "https://blog.example.com/atom.xml",
        body: parkedPage,
        contentType: "text/html",
        fetchCandidate,
        allowDiscovery: false,
      }),
    ).rejects.toThrow("Unsupported feed format")
    expect(fetchCandidate).not.toHaveBeenCalled()
  })

  it("即使关闭发现，显式的 sitescrape 源仍然重新抓取", async () => {
    const result = await resolveFeedDocument({
      mode: "scrape",
      requestUrl: "https://blog.example.com/",
      body: parkedPage,
      contentType: "text/html",
      fetchCandidate: vi.fn(),
      allowDiscovery: false,
    })

    expect(result.source).toBe("scraped")
    expect(result.parsed.items).toHaveLength(3)
  })
})

describe("探测阶段的总时长上限", () => {
  it("超出总预算后停止继续探测", async () => {
    const fetchCandidate = vi.fn().mockResolvedValue({ body: "<html></html>" })
    const manyLinks = `<!doctype html><html><head>${Array.from(
      { length: 8 },
      (_, index) => `<link rel="alternate" type="application/rss+xml" href="/f${index}.xml">`,
    ).join("")}</head><body><main><p>x</p></main></body></html>`

    // first call sets the deadline, second passes the initial batch check,
    // then the clock jumps past the budget
    let calls = 0
    const now = () => {
      calls += 1
      return calls <= 2 ? 0 : DISCOVERY_BUDGET_MS + 1
    }

    await expect(
      resolveFeedDocument({
        mode: "feed",
        requestUrl: "https://example.com/",
        body: manyLinks,
        contentType: "text/html",
        fetchCandidate,
        now,
      }),
    ).rejects.toThrow(FEED_DISCOVERY_FAILED)

    // only the first batch of four ran, not all eight candidates
    expect(fetchCandidate).toHaveBeenCalledTimes(4)
  })
})
