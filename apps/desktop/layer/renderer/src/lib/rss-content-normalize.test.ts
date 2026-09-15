import { describe, expect, it } from "vitest"

import { normalizeRssContentForRender, normalizeRssTitleForRender } from "./rss-content-normalize"

describe("normalizeRssContentForRender", () => {
  it("应把单层转义 HTML 解码为可渲染内容", () => {
    const input = "&lt;p&gt;hello&lt;/p&gt;"
    expect(normalizeRssContentForRender(input)).toBe("<p>hello</p>")
  })

  it("应把双层转义 HTML 解码为可渲染内容", () => {
    const input = "&amp;lt;p&amp;gt;&#60;strong&#62;hi&#60;/strong&#62;&amp;lt;/p&amp;gt;"
    expect(normalizeRssContentForRender(input)).toBe("<p><strong>hi</strong></p>")
  })

  it("普通文本不应误解码", () => {
    const input = "Tom &amp; Jerry"
    expect(normalizeRssContentForRender(input)).toBe("Tom &amp; Jerry")
  })
})

describe("normalizeRssTitleForRender", () => {
  it.each([
    ["Lynan&#39;s Page", "Lynan's Page"],
    ["Lynan&amp;#39;s Page", "Lynan's Page"],
    ["Lynan&#x2019;s Page", "Lynan’s Page"],
    ["Lynan’s Page", "Lynan’s Page"],
    ["Tom &amp; Jerry", "Tom & Jerry"],
    ["&lt;img src=x&gt;", "<img src=x>"],
    ["&#99999999;", "&#99999999;"],
    [null, ""],
    ["", ""],
  ])("decodes %s as text", (input, expected) => {
    expect(normalizeRssTitleForRender(input)).toBe(expected)
  })
})
