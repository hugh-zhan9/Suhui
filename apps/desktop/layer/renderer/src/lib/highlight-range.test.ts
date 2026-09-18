import { beforeEach, describe, expect, it, vi } from "vitest"

import type { LocatableHighlight } from "./highlight-range"
import { locateHighlightRanges } from "./highlight-range"

type MainAnchorModule = {
  articleText: (html: string) => string
  createHighlightAnchor: (text: string, input: { quote: string }) => LocatableHighlight
}

/**
 * The main-process projection is loaded at runtime only: this tsconfig references the
 * main project, so a static import would demand its built declaration output.
 */
const loadMainAnchor = () =>
  vi.importActual<MainAnchorModule>("../../../main/src/application/annotations/anchor")

const renderArticle = (html: string) => {
  document.body.innerHTML = `<article>${html}</article>`
  return document.querySelector("article")!
}

describe("locateHighlightRanges", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("locates a quote that spans inline elements and collapsed whitespace", () => {
    const article = renderArticle(`<p>前面的话，<strong>被高亮的\n  句子</strong>，后面的话。</p>`)

    const [range] = locateHighlightRanges(article, [{ quote: "被高亮的 句子" }])

    expect(range).toBeDefined()
    expect(range!.toString()).toBe("被高亮的\n  句子")
  })

  it("skips quotes that no longer appear in the rendered article", () => {
    const article = renderArticle(`<p>正文已经换了内容。</p>`)

    expect(locateHighlightRanges(article, [{ quote: "旧的引用" }])).toEqual([])
  })

  it("picks the repeated occurrence whose stored context still matches", () => {
    const article = renderArticle(`<p>first target end. second target finish.</p>`)

    const [range] = locateHighlightRanges(article, [
      { quote: "target", prefix: "second ", suffix: " finish." },
    ])

    expect(range).toBeDefined()
    expect(range!.startOffset).toBe("first target end. second ".length)
  })

  it("ignores script and style text", () => {
    const article = renderArticle(
      `<style>.quote { color: red }</style><p>可见的引用</p><script>const quote = 1</script>`,
    )

    expect(locateHighlightRanges(article, [{ quote: "color: red" }])).toEqual([])
    expect(locateHighlightRanges(article, [{ quote: "可见的引用" }])).toHaveLength(1)
  })

  it("returns one range per resolvable highlight", () => {
    const article = renderArticle(`<p>第一段引用</p><p>第二段引用</p>`)

    const ranges = locateHighlightRanges(article, [
      { quote: "第一段引用" },
      { quote: "第二段引用" },
      { quote: "不存在的引用" },
    ])

    expect(ranges.map((range) => range.toString())).toEqual(["第一段引用", "第二段引用"])
  })

  it("treats block boundaries as one space even without whitespace in the source", () => {
    const article = renderArticle(
      `<h2>标题</h2><p>正文</p><div><p>甲</p></div>乙<table><tr><td>a</td><td>b</td></tr></table>`,
    )

    const ranges = locateHighlightRanges(article, [
      { quote: "标题 正文" },
      { quote: "甲 乙" },
      { quote: "a b" },
    ])

    expect(ranges.map((range) => range.toString())).toEqual(["标题正文", "甲乙", "ab"])
  })

  it("treats <br> as a separator but not inline elements", () => {
    const article = renderArticle(`<p>第一行<br>第二行</p><p>a<span>b</span>c</p>`)

    const ranges = locateHighlightRanges(article, [{ quote: "第一行 第二行" }, { quote: "abc" }])

    expect(ranges.map((range) => range.toString())).toEqual(["第一行第二行", "abc"])
  })

  it("paints every anchor the main process accepts for the same HTML", async () => {
    const { articleText, createHighlightAnchor } = await loadMainAnchor()
    const html =
      "<p>必须建立三层模型：</p><ul><li><p><strong>Level 1</strong>：预置模板。</p></li><li><p><code>TECH.md</code>：记录架构。</p></li></ul>"
    const text = articleText(html)
    const anchors = [
      "Level 1：预置模板。",
      "预置模板。\n\nTECH.md：记录架构。",
      "必须建立三层模型：\nLevel 1",
    ].map((quote) => createHighlightAnchor(text, { quote }))
    const article = renderArticle(html)

    const ranges = locateHighlightRanges(article, anchors)

    expect(ranges.map((range) => range.toString())).toEqual([
      "Level 1：预置模板。",
      "预置模板。TECH.md：记录架构。",
      "必须建立三层模型：Level 1",
    ])
  })
})
