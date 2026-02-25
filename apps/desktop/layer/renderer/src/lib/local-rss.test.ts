import { describe, expect, it } from "vitest"

import { parseLocalFeedText } from "./local-rss"

describe("local rss parser", () => {
  it("应能解析标准 RSS 文本为本地 feed 与条目", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Local Test Feed</title>
    <link>https://example.com</link>
    <description>Local feed for test</description>
    <item>
      <title>Entry A</title>
      <link>https://example.com/a</link>
      <guid>a-guid</guid>
      <description>A desc</description>
      <pubDate>Wed, 25 Feb 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Entry B</title>
      <link>https://example.com/b</link>
      <guid>b-guid</guid>
      <description>B desc</description>
      <pubDate>Wed, 25 Feb 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

    const result = parseLocalFeedText(xml, "https://example.com/rss.xml")
    expect(result.feed.title).toBe("Local Test Feed")
    expect(result.feed.url).toBe("https://example.com/rss.xml")
    expect(result.entries.length).toBe(2)
    expect(result.entries[0]?.title).toBe("Entry A")
  })
})

