import { describe, expect, it } from "vitest"

import { createHtmlTranslationPlan, splitTranslationParagraph } from "./html"

describe("article HTML translation plan", () => {
  it.each(["&rsquo;", "&#8217;", "&#x2019;"])(
    "keeps entity-encoded apostrophes inside a single paragraph unit: %s",
    (apostrophe) => {
      const text =
        "Scope: this covers the declaration text and the event timeline, the strongest opposing case, the calibration between guilds and industrialization, and the design of a four-layer industrial stack for mathematics. It does not cover the signatories’ individual positions or independent verification of OpenAI’s technical results. Every design in this article is never untested, and is just a result of brainstorming."
      const plan = createHtmlTranslationPlan(`<p>${text.replaceAll("’", apostrophe)}</p>`)
      expect(text.length).toBe(413)
      expect(plan.batches).toEqual([[text]])
      expect(plan.rebuildPartial([])).toBe(`<p>${text}</p>`)
      expect(plan.rebuild(["完整段落的译文。"]).trim()).toBe("<p>完整段落的译文。</p>")
    },
  )

  it("merges entity fragments within inline elements while preserving their boundaries and attributes", () => {
    const plan = createHtmlTranslationPlan(
      '<p>Read &amp; compare <a href="https://example.com" title="keep">OpenAI&rsquo;s results</a> <strong>today&rsquo;s notes</strong>.</p>',
    )
    expect(plan.batches).toEqual([["Read & compare", "OpenAI’s results", "today’s notes"]])
    expect(plan.rebuildPartial([undefined, "研究结果"])).toBe(
      '<p>Read &amp; compare <a href="https://example.com" title="keep">研究结果</a> <strong>today’s notes</strong>.</p>',
    )
    expect(plan.rebuild(["阅读并比较", "研究结果", "今天的笔记"])).toBe(
      '<p>阅读并比较 <a href="https://example.com" title="keep">研究结果</a> <strong>今天的笔记</strong>.</p>',
    )
  })

  it("still splits large entity-containing paragraphs without losing decoded punctuation", () => {
    const text = `${"a".repeat(1999)}’${"b".repeat(100)}`
    const plan = createHtmlTranslationPlan(`<p>${text.replace("’", "&rsquo;")}</p>`)
    expect(plan.batches).toHaveLength(2)
    expect(plan.batches.every((batch) => batch.length === 1 && batch[0]!.length <= 2000)).toBe(true)
    expect(plan.units.join("")).toBe(text)
    expect(plan.rebuild(plan.units)).toBe(`<p>${text}</p>`)
  })

  it("translates leaf blocks while preserving media and code", () => {
    const plan = createHtmlTranslationPlan(
      '<div><p>Hello <a href="https://example.com">world</a>.</p><img src="cover.jpg"><pre><code>const hello = 1</code></pre></div>',
    )

    expect(plan.units).toEqual(["Hello", "world"])
    const html = plan.rebuild(["你好", "世界"])
    expect(html).toContain('你好 <a href="https://example.com">世界</a>.')
    expect(html).toContain('<img src="cover.jpg">')
    expect(html).toContain("<code>const hello = 1</code>")
    expect(html).not.toContain("data-suhui-translation-unit")
  })

  it("keeps separate paragraphs in separate requests, including a short final paragraph", () => {
    const plan = createHtmlTranslationPlan(
      "<p>First paragraph.</p><p>Second paragraph.</p><p>End.</p>",
    )
    expect(plan.batches).toEqual([["First paragraph."], ["Second paragraph."], ["End."]])
  })

  it("keeps inline text together and honors heading, list, table, div and line-break boundaries", () => {
    const plan = createHtmlTranslationPlan(
      "<h2>Heading</h2><div>Before<p>Hello <strong>world</strong>.</p>After</div><ul><li>One</li><li>Two</li></ul><table><tr><td>Cell A</td><td>Cell B</td></tr></table><p>Line A<br>Line B</p>",
    )
    expect(plan.batches).toEqual([
      ["Heading"],
      ["Before"],
      ["Hello", "world"],
      ["After"],
      ["One"],
      ["Two"],
      ["Cell A"],
      ["Cell B"],
      ["Line A"],
      ["Line B"],
    ])
    expect(plan.rebuild(plan.units)).toContain("Hello <strong>world</strong>.")
  })

  it("splits a large paragraph at sentence boundaries and restores the original node", () => {
    const first = `${"a".repeat(1_200)}. `
    const second = `${"b".repeat(1_200)}。`
    const source = `<p>${first}${second}</p>`
    const plan = createHtmlTranslationPlan(source)
    expect(plan.batches).toEqual([[first.trim()], [second]])
    expect(plan.rebuildPartial([undefined, "第二句。"]).includes(`${first}第二句。`)).toBe(true)
    expect(plan.rebuild(["First translated.", "第二句。"])).toBe(
      "<p>First translated. 第二句。</p>",
    )
    expect(plan.rebuildPartial([])).toBe(source)
  })

  it("splits a large paragraph across inline nodes without losing markup or text", () => {
    const source = `<p>${"a".repeat(1_100)} <a href="keep">${"b".repeat(1_100)}</a> end.</p>`
    const plan = createHtmlTranslationPlan(source)
    expect(plan.batches.length).toBeGreaterThan(1)
    expect(plan.batches.every((batch) => batch.join("").length <= 2_000)).toBe(true)
    expect(plan.rebuild(plan.units)).toBe(source)
    expect(plan.rebuild(plan.units.map((text) => text.toUpperCase()))).toContain('href="keep"')
  })

  it("recognizes blank-line paragraphs in a single text node and preserves their whitespace", () => {
    const source = "<div>  First paragraph.\n\n Second paragraph.\r\n\r\nThird.</div>"
    const plan = createHtmlTranslationPlan(source)
    expect(plan.batches).toEqual([["First paragraph."], ["Second paragraph."], ["Third."]])
    expect(plan.rebuild(plan.units)).toBe(source)
    expect(plan.rebuild(["第一段。", "第二段。", "第三段。"])).toBe(
      "<div>  第一段。\n\n 第二段。\r\n\r\n第三段。</div>",
    )
  })

  it("splits long single sentences at words and unbroken text without splitting surrogate pairs", () => {
    const sentence = "word ".repeat(600)
    const parts = splitTranslationParagraph(sentence)
    expect(parts.length).toBeGreaterThan(1)
    expect(
      parts.every((part) =>
        part
          .trim()
          .split(" ")
          .every((word) => word === "word"),
      ),
    ).toBe(true)
    expect(parts.join("")).toBe(sentence)
    const unbroken = `${"a".repeat(1_999)}😀${"b".repeat(2_500)}`
    const chunks = splitTranslationParagraph(unbroken)
    expect(chunks.every((part) => part.length <= 2_000 && part.isWellFormed())).toBe(true)
    expect(chunks.join("")).toBe(unbroken)
    expect(splitTranslationParagraph("a".repeat(2_000))).toEqual(["a".repeat(2_000)])
    expect(splitTranslationParagraph("")).toEqual([])
  })

  it("can rebuild a partial result without exposing tags or attributes", () => {
    const plan = createHtmlTranslationPlan(
      '<p title="private attribute">First <a href="https://example.com/private">second</a></p>',
    )

    expect(plan.rebuildPartial(["第一段"])).toContain(
      '<p title="private attribute">第一段 <a href="https://example.com/private">second</a></p>',
    )
  })

  it("handles empty input without making a translation unit", () => {
    const plan = createHtmlTranslationPlan("")
    expect(plan.units).toEqual([])
    expect(plan.rebuild([])).toBe("")
  })

  it("does not send code-only HTML to a translation provider", () => {
    const source = '<div><pre><code>const secret = "unchanged"</code></pre></div>'
    const plan = createHtmlTranslationPlan(source)

    expect(plan.units).toEqual([])
    expect(plan.rebuild([])).toContain('const secret = "unchanged"')
  })

  it("keeps tags, attributes, URLs, media, and inline code outside translated units", () => {
    const plan = createHtmlTranslationPlan(
      '<p>Hello <a href="https://example.com/path?q=1">world</a><img src="cover.jpg"><code>npm test</code>.</p>',
    )

    expect(plan.units).toEqual(["Hello", "world"])
    const html = plan.rebuild(["你好", "世界"])
    expect(html).toContain('<a href="https://example.com/path?q=1">世界</a>')
    expect(html).toContain('<img src="cover.jpg">')
    expect(html).toContain("<code>npm test</code>")
  })
})

describe("failed batch markers", () => {
  it("places each marker beside its failed source, outside links, and removes it after success", () => {
    const plan = createHtmlTranslationPlan(
      '<p>First</p><p>Read <a href="https://example.com">link</a></p><iframe src="movie"></iframe>',
    )
    const html = plan.rebuildPartial(["首段"], new Map([[2, "session:content:2"]]))
    expect(html).toContain(
      '<a href="https://example.com">link</a><span data-suhui-translation-retry="session:content:2"></span>',
    )
    expect(html).toContain("首段")
    expect(html).toContain('<iframe src="movie"></iframe>')
    const complete = plan.rebuildPartial(["首段", "读", "链接"])
    expect(complete).not.toContain("translation-retry")
    expect(complete).toContain("链接")
  })
  it("keeps separately retryable failed chunks in the same large paragraph", () => {
    const plan = createHtmlTranslationPlan(`<p>${"A".repeat(4500)}</p>`)
    expect(plan.batches).toHaveLength(3)
    const html = plan.rebuildPartial(
      [undefined, "译B"],
      new Map([
        [0, "first"],
        [2, "third"],
      ]),
    )
    expect(html.match(/data-suhui-translation-retry/g)).toHaveLength(2)
    expect(html).toContain("译B")
  })
})
