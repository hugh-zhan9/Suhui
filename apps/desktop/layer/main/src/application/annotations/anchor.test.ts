import { describe, expect, it } from "vitest"

import { articleText, createHighlightAnchor, relocateHighlightAnchor } from "./anchor"

describe("highlight anchors", () => {
  it("relocates a quote after content is inserted before it", () => {
    const anchor = createHighlightAnchor("Before the selected quote after.", {
      quote: "selected quote",
      startOffset: 11,
      endOffset: 25,
    })
    const relocated = relocateHighlightAnchor("New intro. Before the selected quote after.", anchor)
    expect(relocated.status).toBe("active")
    expect(relocated.startOffset).toBe(22)
  })

  it("uses context to disambiguate duplicate quotes", () => {
    const anchor = createHighlightAnchor("first target end. second target finish.", {
      quote: "target",
      startOffset: 25,
      endOffset: 31,
    })
    const relocated = relocateHighlightAnchor("prefix target end. changed second target finish.", {
      ...anchor,
      startOffset: null,
      endOffset: null,
    })
    expect(relocated.status).toBe("active")
    expect(relocated.startOffset).toBe(34)
  })

  it("uses supplied selection context to create an anchor for repeated text", () => {
    const anchor = createHighlightAnchor("first target end. second target finish.", {
      quote: "target",
      prefix: "second ",
      suffix: " finish.",
    })

    expect(anchor.startOffset).toBe(25)
    expect(anchor.status).toBe("active")
  })

  it("keeps the quote but marks an ambiguous or missing anchor orphaned", () => {
    const anchor = {
      quote: "same",
      prefix: "",
      suffix: "",
      startOffset: null,
      endOffset: null,
      status: "active" as const,
    }
    expect(relocateHighlightAnchor("same and same", anchor)).toMatchObject({
      quote: "same",
      status: "orphaned",
      startOffset: null,
    })
    expect(relocateHighlightAnchor("gone", anchor)).toMatchObject({
      quote: "same",
      status: "orphaned",
    })
  })
})

// Markup shape taken from a real feed entry: bold/code runs inside list items.
const ARTICLE_HTML = `<p>必须建立三层数据准确度模型：</p>

<ul>
<li><p><strong>Level 1: Certified Patterns（100% 准确）</strong>：预置经过验证的 SQL 模板。</p></li>
<li><p><code>TECH.md</code>：记录技术架构、硬性约束与关键路径。</p></li>
</ul>`

describe("articleText", () => {
  it("keeps inline tag boundaries tight so CJK prose matches the rendered text", () => {
    expect(
      articleText("<li><p><code>PRODUCT.md</code>：记录产品目标、业务优先级与成功标准。</p></li>"),
    ).toBe("PRODUCT.md：记录产品目标、业务优先级与成功标准。")
  })

  it("separates block elements with one space and collapses source whitespace", () => {
    expect(
      articleText("<p>四类文件：</p>\n\n<ul>\n<li><p>甲</p></li>\n<li><p>乙</p></li>\n</ul>"),
    ).toBe("四类文件： 甲 乙")
    expect(articleText("<p>第一行<br>第二行</p><p>第三行</p>")).toBe("第一行 第二行 第三行")
  })

  it("decodes entities after stripping tags", () => {
    expect(articleText("<p>A &amp; B&nbsp;C &lt;i&gt;</p>")).toBe("A & B C <i>")
  })
})

describe("createHighlightAnchor against entry HTML", () => {
  it("anchors a selection that crosses an inline tag boundary", () => {
    const anchor = createHighlightAnchor(articleText(ARTICLE_HTML), {
      quote: "Level 1: Certified Patterns（100% 准确）：预置经过验证的 SQL 模板。",
    })

    expect(anchor.status).toBe("active")
    expect(anchor.prefix).toBe("必须建立三层数据准确度模型： ")
    expect(anchor.suffix).toBe(" TECH.md：记录技术架构、硬性约束与关键路径。")
  })

  it("anchors a selection that starts inside a code run", () => {
    const anchor = createHighlightAnchor(articleText(ARTICLE_HTML), {
      quote: "TECH.md：记录技术架构",
    })

    expect(anchor).toMatchObject({ status: "active", quote: "TECH.md：记录技术架构" })
  })

  it("anchors a selection that crosses block elements using the browser's newline", () => {
    const anchor = createHighlightAnchor(articleText(ARTICLE_HTML), {
      quote: "预置经过验证的 SQL 模板。\n\nTECH.md：记录技术架构",
    })

    expect(anchor.status).toBe("active")
    expect(anchor.quote).toBe("预置经过验证的 SQL 模板。 TECH.md：记录技术架构")
  })
})

describe("relocating highlights stored under the previous projection", () => {
  // The old projection put a space around every tag and a newline at block ends.
  const legacyHtml = "<p>Run <code>make</code>build<em>now</em> and later the build step again.</p>"

  it("re-reads prefix and suffix from the current text instead of carrying stale context", () => {
    const text = articleText(legacyHtml)
    const relocated = relocateHighlightAnchor(text, {
      quote: "build step",
      prefix: "Run make build now and later the ",
      suffix: " again.\n",
      startOffset: 40,
      endOffset: 50,
      status: "active",
    })

    expect(relocated.status).toBe("active")
    expect(relocated.startOffset).toBe(text.indexOf("build step"))
    expect(relocated.prefix).toBe("Run makebuildnow and later the ")
    expect(relocated.suffix).toBe(" again.")
  })

  it("ignores whitespace when matching context so stale spacing cannot pick a wrong occurrence", () => {
    const text = articleText(legacyHtml)
    const relocated = relocateHighlightAnchor(text, {
      quote: "build",
      prefix: "Run make ",
      suffix: " now and later",
      startOffset: null,
      endOffset: null,
      status: "orphaned",
    })

    expect(relocated.status).toBe("active")
    expect(relocated.startOffset).toBe(text.indexOf("build"))
  })

  it("accepts renderer context that has no space at a block boundary", () => {
    const anchor = createHighlightAnchor(articleText("<p>ab</p><p>ab</p><p>ab</p>"), {
      quote: "ab",
      prefix: "ab",
      suffix: "ab",
    })

    expect(anchor.startOffset).toBe("ab ".length)
  })
})
