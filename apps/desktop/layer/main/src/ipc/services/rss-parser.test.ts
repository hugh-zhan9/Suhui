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
})

