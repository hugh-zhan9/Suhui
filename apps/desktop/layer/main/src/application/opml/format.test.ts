import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { generateOpml, parseOpml } from "./format"

describe("local OPML format", () => {
  it("uses the canvas-free linkedom worker entry in the Electron main process", () => {
    const source = readFileSync(new URL("./format.ts", import.meta.url), "utf8")

    expect(source).toContain('from "linkedom/worker"')
    expect(source).not.toContain('from "linkedom"')
  })

  it("parses nested categories and RSS/Atom outlines offline", () => {
    const result = parseOpml(`<?xml version="1.0"?><opml version="2.0"><body>
      <outline text="Tech"><outline type="rss" text="A" xmlUrl="https://a.test/feed.xml"/></outline>
      <outline type="atom" title="B" category="News" xmlUrl="https://b.test/atom.xml"/>
      <outline text="Legacy" xmlUrl="https://legacy.test/feed.xml"/>
    </body></opml>`)

    expect(result).toEqual([
      { url: "https://a.test/feed.xml", title: "A", category: "Tech", htmlUrl: null },
      { url: "https://b.test/atom.xml", title: "B", category: "News", htmlUrl: null },
      { url: "https://legacy.test/feed.xml", title: "Legacy", category: null, htmlUrl: null },
    ])
  })

  it("generates parseable OPML while preserving categories", () => {
    const xml = generateOpml([
      {
        url: "https://example.com/feed?x=1&y=2",
        title: "A & B",
        category: "Tech",
        htmlUrl: "https://example.com",
      },
    ])

    expect(parseOpml(xml)).toEqual([
      {
        url: "https://example.com/feed?x=1&y=2",
        title: "A & B",
        category: "Tech",
        htmlUrl: "https://example.com",
      },
    ])
  })

  it("preserves percent-encoded entity text inside URLs", () => {
    const result = parseOpml(
      '<?xml version="1.0"?><opml version="2.0"><body><outline type="rss" text="A &amp;amp; B" xmlUrl="https://example.com/feed?value=a%26amp%3Bb"/></body></opml>',
    )

    expect(result[0]).toMatchObject({
      title: "A &amp; B",
      url: "https://example.com/feed?value=a%26amp%3Bb",
    })
  })
})
