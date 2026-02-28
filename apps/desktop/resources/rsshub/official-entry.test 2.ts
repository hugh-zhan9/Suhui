import { describe, expect, it } from "vitest"

import { readRsshubErrorMessage, toRssXml } from "./official-entry.js"

describe("official entry rss xml", () => {
  it("应将 RSSHub Data 转换为 RSS XML", () => {
    const xml = toRssXml(
      {
        title: "GitHub Trending",
        link: "https://github.com/trending",
        description: "test feed",
        item: [
          {
            title: "repo-1",
            link: "https://github.com/vercel/next.js",
            description: "desc",
            pubDate: "2026-01-01T00:00:00.000Z",
            guid: "g1",
          },
        ],
      },
      "http://127.0.0.1:12000/github/trending",
    )

    expect(xml).toContain("<rss")
    expect(xml).toContain("<title>GitHub Trending</title>")
    expect(xml).toContain("<item>")
    expect(xml).toContain("<guid>g1</guid>")
  })

  it("应识别 RSSHub 错误对象中的 message", () => {
    expect(readRsshubErrorMessage({ error: { message: "bad gateway" } })).toBe("bad gateway")
    expect(readRsshubErrorMessage({ error: { message: "   " } })).toBe("")
    expect(readRsshubErrorMessage({ error: {} })).toBe("")
    expect(readRsshubErrorMessage({})).toBe("")
  })
})
