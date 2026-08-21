import { describe, expect, it } from "vitest"

import { buildScrapedFeed, extractSiteArticles, parseArticleDate } from "./site-scrape"

const hexoStyleListing = `<!doctype html><html><head><title>徐靖峰|个人博客</title></head><body>
  <nav><a href="/archives/">归档</a><a href="/about/">关于我</a></nav>
  <main>
    <article class="card">
      <h2><a class="article-title" href="/ai-200usd-sub-md/">我的 200 美元 AI 订阅方案</a></h2>
      <time dateTime="\${date_xml(page.date)}" title="\${date_xml(page.date)}">2026-05-21</time>
      <p>聊聊我这一年的订阅账单。</p>
    </article>
    <article class="card">
      <h2><a class="article-title" href="/ai-agents-md-practise/">AGENTS.md 实践指南</a></h2>
      <time dateTime="\${date_xml(page.date)}" title="\${date_xml(page.date)}">2026-04-19</time>
    </article>
    <article class="card">
      <h2><a class="article-title" href="/qoder-blog-build-practise/">从 Qoder 搭建博客服务器聊起</a></h2>
      <time dateTime="\${date_xml(page.date)}" title="\${date_xml(page.date)}">2026-03-23</time>
    </article>
  </main>
  <footer><a href="/feed">RSS 订阅</a></footer>
</body></html>`

const navigationOnlyPage = `<!doctype html><html><head><title>Newsroom</title></head><body>
  <main>
    <div class="grid">
      <a class="tile" href="/claude/mythos">Mythos</a>
      <a class="tile" href="/claude/fable">Fable</a>
      <a class="tile" href="/claude/opus">Opus</a>
      <a class="tile" href="/claude/sonnet">Sonnet</a>
    </div>
  </main>
</body></html>`

describe("extractSiteArticles", () => {
  it("datetime 属性是未求值的模板字面量时回退到可见文本", () => {
    const result = extractSiteArticles(hexoStyleListing, "https://www.cnkirito.moe/")

    expect(result.rejectedReason).toBeNull()
    expect(result.articles).toHaveLength(3)
    expect(result.articles[0]).toMatchObject({
      url: "https://www.cnkirito.moe/ai-200usd-sub-md/",
      title: "我的 200 美元 AI 订阅方案",
      dateSource: "time-text",
    })
    expect(new Date(result.articles[0]!.publishedAt).toISOString()).toBe("2026-05-21T00:00:00.000Z")
  })

  it("按发布时间倒序返回条目", () => {
    const { articles } = extractSiteArticles(hexoStyleListing, "https://www.cnkirito.moe/")

    expect(articles.map((item) => new Date(item.publishedAt).toISOString().slice(0, 10))).toEqual([
      "2026-05-21",
      "2026-04-19",
      "2026-03-23",
    ])
  })

  it("排除导航、页头、页脚与侧栏里的链接", () => {
    const { articles } = extractSiteArticles(hexoStyleListing, "https://www.cnkirito.moe/")
    const urls = articles.map((item) => item.url)

    expect(urls).not.toContain("https://www.cnkirito.moe/about/")
    expect(urls).not.toContain("https://www.cnkirito.moe/archives/")
    expect(urls).not.toContain("https://www.cnkirito.moe/feed")
  })

  it("无可靠日期的同构链接组被拒绝，而不是当作文章入库", () => {
    const result = extractSiteArticles(navigationOnlyPage, "https://www.anthropic.com/news")

    expect(result.rejectedReason).toBe("NO_RELIABLE_DATES")
    expect(result.articles).toEqual([])
    expect(result.confidence?.datedRatio).toBe(0)
  })

  it("同构链接不足时拒绝", () => {
    const html = `<html><body><main><article><a href="/only-one/">仅有一篇文章标题</a>
      <time datetime="2026-05-21">2026-05-21</time></article></main></body></html>`

    expect(extractSiteArticles(html, "https://example.com/").rejectedReason).toBe(
      "NO_REPEATED_LINK_GROUP",
    )
  })

  it("页面无任何同源链接时拒绝", () => {
    const html = `<html><body><main><p>没有链接的页面</p></main></body></html>`

    expect(extractSiteArticles(html, "https://example.com/")).toEqual({
      articles: [],
      confidence: null,
      rejectedReason: "NO_REPEATED_LINK_GROUP",
    })
  })

  it("优先使用可解析的 datetime 属性", () => {
    const html = `<html><body><main>
      <li class="p"><a href="/a/">First Real Article</a><time datetime="2026-01-02T03:04:05Z">Jan 2</time></li>
      <li class="p"><a href="/b/">Second Real Article</a><time datetime="2026-01-01T00:00:00Z">Jan 1</time></li>
      <li class="p"><a href="/c/">Third Real Article</a><time datetime="2025-12-31T00:00:00Z">Dec 31</time></li>
    </main></body></html>`

    const { articles, rejectedReason } = extractSiteArticles(html, "https://example.com/")

    expect(rejectedReason).toBeNull()
    expect(articles[0]).toMatchObject({ dateSource: "time-attr", url: "https://example.com/a/" })
    expect(new Date(articles[0]!.publishedAt).toISOString()).toBe("2026-01-02T03:04:05.000Z")
  })

  it("忽略站外链接与静态资源链接", () => {
    const html = `<html><body><main>
      <li class="p"><a href="/a/">First Real Article</a><time datetime="2026-01-03">x</time></li>
      <li class="p"><a href="/b/">Second Real Article</a><time datetime="2026-01-02">x</time></li>
      <li class="p"><a href="/c/">Third Real Article</a><time datetime="2026-01-01">x</time></li>
      <li class="p"><a href="https://other.example/post">External Article Link</a></li>
      <li class="p"><a href="/paper.pdf">Downloadable Paper File</a></li>
    </main></body></html>`

    const urls = extractSiteArticles(html, "https://example.com/").articles.map((i) => i.url)

    expect(urls).toEqual([
      "https://example.com/a/",
      "https://example.com/b/",
      "https://example.com/c/",
    ])
  })
})

describe("parseArticleDate", () => {
  it("拒绝未求值的模板字面量", () => {
    // 这里的 ${...} 是被测输入本身：模板引擎漏到 datetime 属性里的原始文本
    // eslint-disable-next-line no-template-curly-in-string
    expect(parseArticleDate("${date_xml(page.date)}")).toBeNull()
    expect(parseArticleDate("{{ post.date }}")).toBeNull()
  })

  it("解析中文日期格式", () => {
    expect(parseArticleDate("2026年5月21日")?.toISOString()).toBe("2026-05-21T00:00:00.000Z")
  })

  it("拒绝年份超出合理范围的意外解析", () => {
    expect(parseArticleDate("5.4.0")).toBeNull()
    expect(parseArticleDate("")).toBeNull()
    expect(parseArticleDate(null)).toBeNull()
  })
})

describe("卡片式布局的标题抽取", () => {
  const cardListing = `<!doctype html><html><head><title>Newsroom</title></head><body><main><ul>
    <li><a href="/news/a" class="listItem">
      <div class="meta"><time class="date">Aug 7, 2026</time><span class="subject">Product</span></div>
      <span class="title">Improving safeguards</span></a></li>
    <li><a href="/news/b" class="listItem">
      <div class="meta"><time class="date">Aug 4, 2026</time><span class="subject">Announcements</span></div>
      <span class="title">Someone joins as Chief Global Affairs Officer</span></a></li>
    <li><a href="/news/c" class="listItem">
      <div class="meta"><time class="date">Aug 1, 2026</time><span class="subject">Product</span></div>
      <span class="title">Investigating cybersecurity evals</span></a></li>
  </ul></main></body></html>`

  it("整块被单个链接包裹时，用 title 类元素而不是整段文本", () => {
    const { articles, rejectedReason } = extractSiteArticles(
      cardListing,
      "https://example.com/news",
    )

    expect(rejectedReason).toBeNull()
    expect(articles.map((item) => item.title)).toEqual([
      "Improving safeguards",
      "Someone joins as Chief Global Affairs Officer",
      "Investigating cybersecurity evals",
    ])
    expect(articles[0]!.title).not.toContain("Aug 7")
    expect(articles[0]!.title).not.toContain("Product")
  })

  it("优先使用链接内的标题元素", () => {
    const html = `<html><body><main>
      <li class="p"><a href="/a/"><span class="meta">2026-01-03 · Tech</span><h3>Real Article Title A</h3></a><time datetime="2026-01-03">x</time></li>
      <li class="p"><a href="/b/"><span class="meta">2026-01-02 · Tech</span><h3>Real Article Title B</h3></a><time datetime="2026-01-02">x</time></li>
      <li class="p"><a href="/c/"><span class="meta">2026-01-01 · Tech</span><h3>Real Article Title C</h3></a><time datetime="2026-01-01">x</time></li>
    </main></body></html>`

    expect(extractSiteArticles(html, "https://example.com/").articles.map((i) => i.title)).toEqual([
      "Real Article Title A",
      "Real Article Title B",
      "Real Article Title C",
    ])
  })

  it("没有标题元素时回退到链接文本并剔除日期", () => {
    const html = `<html><body><main>
      <li class="p"><a href="/a/"><time>2026-01-03</time>Plain Anchor Article A</a></li>
      <li class="p"><a href="/b/"><time>2026-01-02</time>Plain Anchor Article B</a></li>
      <li class="p"><a href="/c/"><time>2026-01-01</time>Plain Anchor Article C</a></li>
    </main></body></html>`

    expect(extractSiteArticles(html, "https://example.com/").articles.map((i) => i.title)).toEqual([
      "Plain Anchor Article A",
      "Plain Anchor Article B",
      "Plain Anchor Article C",
    ])
  })
})

describe("共享容器不得把一个日期分给整组链接", () => {
  it("导航网格里出现一个日期时仍然拒绝", () => {
    // 这个日期属于网格本身，不属于任何一个链接
    const html = `<main><div class="grid">
      <p>Updated <time datetime="2026-08-07">Aug 7, 2026</time></p>
      <a class="tile" href="/claude/mythos">Mythos model card</a>
      <a class="tile" href="/claude/fable">Fable model card</a>
      <a class="tile" href="/claude/opus">Opus model card</a>
    </div></main>`

    const result = extractSiteArticles(html, "https://example.com/")

    expect(result.rejectedReason).toBe("NO_RELIABLE_DATES")
    expect(result.confidence?.datedRatio).toBe(0)
    expect(result.articles).toEqual([])
  })

  it("共享容器也不得把兄弟链接的文本写进摘要", () => {
    const html = `<main><div class="grid">
      <a class="tile" href="/a">Alpha model card</a>
      <a class="tile" href="/b">Beta model card</a>
      <a class="tile" href="/c">Gamma model card</a>
      <time datetime="2026-08-07">Aug 7</time>
    </div></main>`

    const { confidence } = extractSiteArticles(html, "https://example.com/")

    expect(confidence?.datedRatio).toBe(0)
  })

  it("每条各有独立容器时正常采用容器内日期", () => {
    const html = `<main>
      <li class="p"><a href="/a/">First Real Article</a><time datetime="2026-01-03">x</time></li>
      <li class="p"><a href="/b/">Second Real Article</a><time datetime="2026-01-02">x</time></li>
      <li class="p"><a href="/c/">Third Real Article</a><time datetime="2026-01-01">x</time></li>
    </main>`

    const { articles, rejectedReason } = extractSiteArticles(html, "https://example.com/")

    expect(rejectedReason).toBeNull()
    expect(articles.map((item) => item.dateSource)).toEqual(["time-attr", "time-attr", "time-attr"])
    expect(new Set(articles.map((item) => item.publishedAt)).size).toBe(3)
  })
})

describe("日期只接受明确到某一天的写法", () => {
  it.each(["2026", "2026-05", "1.2.2026", "2026-02-30", "v5.4.0", "2026年5月"])(
    "拒绝 %s",
    (input) => {
      expect(parseArticleDate(input)).toBeNull()
    },
  )

  it("同一天的各种写法统一归一到 UTC 零点", () => {
    const expected = "2026-05-21T00:00:00.000Z"

    for (const input of [
      "2026-05-21",
      "2026/05/21",
      "2026.05.21",
      "May 21, 2026",
      "21 May 2026",
      "2026年5月21日",
    ]) {
      expect(parseArticleDate(input)?.toISOString()).toBe(expected)
    }
  })

  it("带时间的时间戳保留原始偏移", () => {
    expect(parseArticleDate("2026-01-02T03:04:05Z")?.toISOString()).toBe("2026-01-02T03:04:05.000Z")
    expect(parseArticleDate("2026-01-02T00:00:00+08:00")?.toISOString()).toBe(
      "2026-01-01T16:00:00.000Z",
    )
  })
})

describe("永久链接里的日期", () => {
  it("列表页没写日期时采用链接路径中的日期", () => {
    const html = `<main>
      <li class="p"><a href="/2026/01/15/hello-world/">Hello World and Other Stories</a></li>
      <li class="p"><a href="/2026/02/10/second-post/">Second Post With A Title</a></li>
      <li class="p"><a href="/2026/03/05/third-post/">Third Post With A Title</a></li>
    </main>`

    const { articles, rejectedReason } = extractSiteArticles(html, "https://example.com/")

    expect(rejectedReason).toBeNull()
    expect(articles[0]).toMatchObject({ dateSource: "url-path" })
    expect(new Date(articles[0]!.publishedAt).toISOString()).toBe("2026-03-05T00:00:00.000Z")
  })

  it("路径只到月份时不猜测具体某天", () => {
    const html = `<main>
      <li class="p"><a href="/2026/01/hello-world/">Hello World and Other Stories</a></li>
      <li class="p"><a href="/2026/02/second-post/">Second Post With A Title</a></li>
      <li class="p"><a href="/2026/03/third-post/">Third Post With A Title</a></li>
    </main>`

    expect(extractSiteArticles(html, "https://example.com/").rejectedReason).toBe(
      "NO_RELIABLE_DATES",
    )
  })
})

describe("摘要的提取质量", () => {
  const cardWithExcerpt = `<!doctype html><html><head><title>博客</title></head><body><main>
    <article class="card">
      <h2><a href="/a/">我的 200 美元 AI 订阅方案</a></h2>
      <time datetime="2026-05-21">2026-05-21</time>
      <time datetime="2026-05-21">2026-05-21</time>
      <span class="tag">AI</span><span class="len">1 小时读完</span>
      <p>写在前面</p><p>这是正文摘要的第一段。</p>
      <script>console.log("noise")</script>
    </article>
    <article class="card">
      <h2><a href="/b/">第二篇文章的标题</a></h2>
      <time datetime="2026-04-19">2026-04-19</time>
      <span class="tag">AI</span><p>第二篇的摘要内容。</p>
    </article>
    <article class="card">
      <h2><a href="/c/">第三篇文章的标题</a></h2>
      <time datetime="2026-03-23">2026-03-23</time>
      <span class="tag">AI</span><p>第三篇的摘要内容。</p>
    </article>
  </main></body></html>`

  it("摘要里不残留已被当作发布时间读走的 time 文本", () => {
    const { articles } = extractSiteArticles(cardWithExcerpt, "https://example.com/")

    expect(articles[0]!.description).not.toContain("2026-05-21")
    expect(articles[0]!.description).toContain("写在前面")
  })

  it("元素边界补分隔符，避免相邻文本粘连", () => {
    const { articles } = extractSiteArticles(cardWithExcerpt, "https://example.com/")

    // 没有分隔符时会得到 "1 小时读完写在前面"
    expect(articles[0]!.description).not.toContain("读完写在前面")
    expect(articles[0]!.description).toMatch(/1 小时读完 写在前面/)
  })

  it("摘要排除 script 内容", () => {
    const { articles } = extractSiteArticles(cardWithExcerpt, "https://example.com/")

    expect(articles[0]!.description).not.toContain("console.log")
  })

  it("生成的条目 content 回退到摘要，与 parseRss 口径一致", () => {
    const { articles } = extractSiteArticles(cardWithExcerpt, "https://example.com/")
    const feed = buildScrapedFeed({
      html: cardWithExcerpt,
      pageUrl: "https://example.com/",
      articles,
    })

    expect(feed.items[0]!.content).toBe(feed.items[0]!.description)
    expect(feed.items[0]!.content.length).toBeGreaterThan(0)
  })
})
