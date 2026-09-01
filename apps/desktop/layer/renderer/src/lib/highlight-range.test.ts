import { beforeEach, describe, expect, it } from "vitest"

import { locateHighlightRanges } from "./highlight-range"

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
})
