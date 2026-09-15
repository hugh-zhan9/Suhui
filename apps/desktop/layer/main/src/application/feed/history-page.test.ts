import { describe, expect, it } from "vitest"

import { extractSiteArticles } from "~/ipc/services/site-scrape"

import { parseHistoryPage } from "./history-page"

const card = (id: number) =>
  `<div class="post-item"><div class="item-body"><div class="title-excerpt"><div class="title-excerpt-text"><a class="title" href="/article-${id}/">杭州旅行<span class="sub-title">mini ${id}</span></a><div class="excerpt">周末旅行摘要</div></div><div class="post-meta"><time datetime="2025-12-27T16:00:00.000Z">12 月 28 日，2025</time><a href="/tags/travel/">旅行标签</a></div></div></div></div>`

describe("history page discovery", () => {
  it("reads Lynan-style cards with complete titles and per-card dates", () => {
    const html = `<main>${[1, 2, 3].map(card).join("")}</main><a rel="next" href="/page/2/">下一页</a><a href="/archives/">归档</a>`
    const result = parseHistoryPage(html, "https://lynan.cn/", [])
    expect(result.articles).toHaveLength(3)
    expect(result.articles[0]).toMatchObject({
      title: "杭州旅行mini 1",
      publishedAt: Date.parse("2025-12-27T16:00:00.000Z"),
    })
    expect(result.pages).toEqual(["https://lynan.cn/page/2/", "https://lynan.cn/archives/"])
  })

  it("accepts a single-item tail only after its structure was established", () => {
    const first = parseHistoryPage(
      `<main>${[1, 2, 3].map(card).join("")}</main>`,
      "https://blog.test/",
      [],
    )
    const tail = `<main>${card(4)}</main>`
    expect(
      parseHistoryPage(tail, "https://blog.test/page/2/", first.signatures!).articles,
    ).toHaveLength(1)
    expect(parseHistoryPage(tail, "https://blog.test/page/2/", []).articles).toEqual([])
    expect(extractSiteArticles(tail, "https://blog.test/page/2/").articles).toEqual([])
  })

  it("excludes external pagination, credentials, javascript, and navigation articles", () => {
    const result = parseHistoryPage(
      `<nav><a href="/not-an-article">Navigation</a></nav>
      <a rel="next" href="https://elsewhere.test/page/2">下一页</a>
      <a rel="next" href="https://u:p@blog.test/page/2">下一页</a>
      <a rel="next" href="javascript:alert(1)">下一页</a>
      <a href="/archives/2025/">2025</a>`,
      "https://blog.test/archives/",
      [],
    )
    expect(result.articles).toEqual([])
    expect(result.pages).toEqual(["https://blog.test/archives/2025/"])
  })

  it("extracts a pinned card title without its excerpt or metadata", () => {
    const html = [1, 2, 3]
      .map(
        (id) =>
          `<a class="post-item" href="/p${id}"><div class="title-excerpt"><div class="title">四川旅行<span class="sub-title">2026</span></div><div class="excerpt">不属于标题的描述</div><time datetime="2026-06-20">date</time></div></a>`,
      )
      .join("")
    expect(parseHistoryPage(html, "https://blog.test/", []).articles.map((x) => x.title)).toEqual([
      "四川旅行2026",
      "四川旅行2026",
      "四川旅行2026",
    ])
  })
})
