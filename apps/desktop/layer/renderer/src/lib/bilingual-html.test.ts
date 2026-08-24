import { describe, expect, it } from "vitest"

import { buildBilingualHtml, resolveTranslationHtml } from "./bilingual-html"

describe("bilingual article HTML", () => {
  it("places each translated paragraph directly below its source", () => {
    const html = buildBilingualHtml(
      "<h2>Heading</h2><p>Hello <strong>world</strong>.</p>",
      "<h2>标题</h2><p>你好，<strong>世界</strong>。</p>",
    )

    const document = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
    const translations = [...document.querySelectorAll("[data-suhui-translation]")]
    expect(translations).toHaveLength(2)
    expect(translations[0]?.tagName).toBe("H2")
    expect(translations[0]?.textContent).toBe("标题")
    expect(translations[1]?.previousElementSibling?.textContent).toBe("Hello world.")
    expect(translations[1]?.innerHTML).toBe("你好，<strong>世界</strong>。")
  })

  it("does not duplicate article media in bilingual mode", () => {
    const html = buildBilingualHtml(
      '<p>Hello<img src="cover.jpg"></p>',
      '<p>你好<img src="cover.jpg"></p>',
    )

    expect(html.match(/cover\.jpg/g)).toHaveLength(1)
    expect(html).toContain("你好")
  })

  it("replaces the complete article in translation-only mode", () => {
    expect(
      resolveTranslationHtml({
        sourceHtml: "<p>Hello</p>",
        translatedHtml: "<p>你好</p>",
        mode: "translation-only",
      }),
    ).toBe("<p>你好</p>")
  })

  it("keeps the source when no translation exists", () => {
    expect(
      resolveTranslationHtml({
        sourceHtml: "<p>Hello</p>",
        translatedHtml: null,
        mode: "bilingual",
      }),
    ).toBe("<p>Hello</p>")
  })
})
