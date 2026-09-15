import { parseHtmlToHast } from "@suhui/utils/html"
import type { Element } from "hast"
import { describe, expect, it } from "vitest"
import { normalizeReaderDarkColors } from "./reader-dark-colors"

describe("dark article colors", () => {
  it("removes conflicting author colors, even important declarations, while keeping layout and the cached light tree", () => {
    const tree = parseHtmlToHast(
      '<section style="background:#fff"><p style="color:#000!important; background-color:white; font-size:18px; text-align:center">文字</p></section>',
      { renderInlineStyle: true },
    )
    const original = JSON.stringify(tree)
    const dark = normalizeReaderDarkColors(tree)
    const section = dark.children.find(
      (node) => node.type === "element" && node.tagName === "section",
    ) as Element
    const paragraph = section.children.find((node) => node.type === "element") as Element
    expect(paragraph.properties.style).not.toMatch(/color|background/)
    expect(paragraph.properties.style).toContain("font-size: 18px")
    expect(paragraph.properties.style).toContain("text-align: center")
    expect(JSON.stringify(tree)).toBe(original)
  })
  it("preserves image and SVG colors and code syntax highlighting", () => {
    const tree = parseHtmlToHast(
      '<pre><code style="color:red">code</code></pre><svg><path fill="#000" /></svg><img src="https://example.com/image.png" style="background:white">',
      { renderInlineStyle: true },
    )
    const dark = normalizeReaderDarkColors(tree)
    for (const node of tree.children.filter((node) => node.type === "element"))
      expect(dark.children).toContain(node)
  })
})
