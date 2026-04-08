import { describe, expect, it } from "vitest"

import { parseRssFeed } from "./rss-parser"

describe("rss parser", () => {
  it("应去除描述中重复标题与 HTML 噪音", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>Test feed description</description>
    <item>
      <title>How to Integrate Services With LLM</title>
      <link>https://example.com/post-1</link>
      <guid>post-1</guid>
      <description><![CDATA[
        <p>How to Integrate Services With LLM 如何用大语言模型集成各个服务，提高工作效率</p>
        <h2>什么是 AI 智能体（AI Agent）</h2>
        <h3>二级标题</h3>
      ]]></description>
      <pubDate>Wed, 25 Feb 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

    const parsed = parseRssFeed(xml)
    const item = parsed.items[0]

    expect(item).toBeDefined()
    expect(item?.title).toBe("How to Integrate Services With LLM")
    expect(item?.description).not.toMatch(/^How to Integrate Services With LLM/)
    expect(item?.description).toContain("如何用大语言模型集成各个服务")
  })

  it("应把转义的 HTML 正文解码为可渲染内容", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Encoded Feed</title>
    <item>
      <title>Encoded HTML Content</title>
      <link>https://example.com/post-2</link>
      <guid>post-2</guid>
      <description>&lt;p&gt;&lt;img src="https://example.com/a.jpg" referrerpolicy="no-referrer"&gt;&lt;/p&gt;</description>
      <pubDate>Wed, 25 Feb 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

    const parsed = parseRssFeed(xml)
    const item = parsed.items[0]

    expect(item?.content).toContain("<img")
    expect(item?.content).not.toContain("&lt;img")
  })

  it("应处理双重转义与数字实体，避免正文显示标签原文", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Double Encoded Feed</title>
    <item>
      <title>Double Encoded HTML</title>
      <link>https://example.com/post-3</link>
      <guid>post-3</guid>
      <description>&amp;lt;p&amp;gt;&#60;strong&#62;Hello&#60;/strong&#62;&amp;lt;a href=&quot;https://example.com&quot;&amp;gt;link&amp;lt;/a&amp;gt;&amp;lt;/p&amp;gt;</description>
      <pubDate>Wed, 25 Feb 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

    const parsed = parseRssFeed(xml)
    const item = parsed.items[0]

    expect(item?.content).toContain("<p>")
    expect(item?.content).toContain("<strong>Hello</strong>")
    expect(item?.content).toContain('<a href="https://example.com">link</a>')
    expect(item?.content).not.toContain("&lt;p&gt;")
    expect(item?.content).not.toContain("&#60;strong&#62;")
  })

  it("应过滤没有有效字段的空 item，避免入库 Untitled 空内容", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty Items Feed</title>
    <item></item>
    <item><title>ok</title><link>https://example.com/ok</link></item>
  </channel>
</rss>`
    const parsed = parseRssFeed(xml)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]?.title).toBe("ok")
  })

  it("应支持从 dc:date 提取发布时间", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>DC Feed</title>
    <item>
      <title>with dc date</title>
      <link>https://example.com/dc</link>
      <guid>dc-1</guid>
      <dc:date>2026-03-25T10:00:00Z</dc:date>
    </item>
  </channel>
</rss>`

    const parsed = parseRssFeed(xml)

    expect(parsed.items[0]?.publishedAt).toBe(new Date("2026-03-25T10:00:00Z").getTime())
  })

  it("应先解码 pubDate 中的 HTML 实体再解析时区", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Entity Date Feed</title>
    <item>
      <title>entity date</title>
      <link>https://example.com/entity-date</link>
      <guid>entity-date-1</guid>
      <pubDate>Sat, 02 Aug 2025 15:00:00 &#43;0800</pubDate>
    </item>
  </channel>
</rss>`

    const parsed = parseRssFeed(xml)

    expect(parsed.items[0]?.publishedAt).toBe(new Date("Sat, 02 Aug 2025 15:00:00 +0800").getTime())
  })

  it("应支持将 HKT 这类 RSS 时区缩写规范化为标准偏移", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>HKT Feed</title>
    <item>
      <title>hkt date</title>
      <link>https://example.com/hkt-date</link>
      <guid>hkt-date-1</guid>
      <pubDate>Thu, 12 Mar 2026 22:14:16 HKT</pubDate>
    </item>
  </channel>
</rss>`

    const parsed = parseRssFeed(xml)

    expect(parsed.items[0]?.publishedAt).toBe(new Date("Thu, 12 Mar 2026 22:14:16 +0800").getTime())
  })

  it("缺失或无效发布时间时应返回 0，而不是当前时间", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>No Date Feed</title>
    <item>
      <title>no date</title>
      <link>https://example.com/no-date</link>
      <guid>no-date-1</guid>
    </item>
    <item>
      <title>bad date</title>
      <link>https://example.com/bad-date</link>
      <guid>bad-date-1</guid>
      <pubDate>not-a-date</pubDate>
    </item>
  </channel>
</rss>`

    const parsed = parseRssFeed(xml)

    expect(parsed.items[0]?.publishedAt).toBe(0)
    expect(parsed.items[1]?.publishedAt).toBe(0)
  })
})
