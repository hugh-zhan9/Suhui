import { describe, expect, it } from "vitest"

import { batchTranslationUnits, createHtmlTranslationPlan } from "./html"

describe("article HTML translation plan", () => {
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

  it("keeps a partial final batch", () => {
    expect(batchTranslationUnits(["1234", "5678", "9"], 8)).toEqual([["1234", "5678"], ["9"]])
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
