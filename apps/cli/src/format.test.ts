import { describe, expect, it } from "vitest"

import {
  formatEntriesListMarkdown,
  formatEntryDetailMarkdown,
  formatFeedsMarkdown,
  formatJson,
  htmlToMarkdown,
  truncateText,
} from "./format.js"
import type { AgentEntriesListResult, AgentEntryDetail, AgentFeedsListResult } from "./types.js"

const listResult: AgentEntriesListResult = {
  items: [
    {
      id: "entry-1",
      feedId: "feed-1",
      feedTitle: "Example Feed",
      title: "Example Post",
      url: "https://example.com/post",
      author: "Ada",
      publishedAt: 1710000000000,
      publishedAtIso: "2024-03-09T16:00:00.000Z",
      insertedAt: 1710000001000,
      insertedAtIso: "2024-03-09T16:00:01.000Z",
      read: false,
    },
  ],
  page: { limit: 20, nextCursor: "next-123", hasMore: true },
}

describe("formatJson", () => {
  it("emits stable pretty JSON", () => {
    expect(formatJson({ z: 1, a: { b: 2 } })).toBe('{\n  "z": 1,\n  "a": {\n    "b": 2\n  }\n}\n')
  })
})

describe("formatEntriesListMarkdown", () => {
  it("includes useful entry metadata and next cursor", () => {
    const markdown = formatEntriesListMarkdown(listResult)

    expect(markdown).toContain("# Suhui Entries")
    expect(markdown).toContain("## Example Post")
    expect(markdown).toContain("- Feed: Example Feed")
    expect(markdown).toContain("- ID: `entry-1`")
    expect(markdown).toContain("- State: unread")
    expect(markdown).toContain(`- Published: ${new Date(1710000000000).toLocaleString()}`)
    expect(markdown).toContain("- URL: https://example.com/post")
    expect(markdown).toContain("Next cursor: `next-123`")
  })
})

describe("formatEntryDetailMarkdown", () => {
  it("includes metadata and converts HTML content to Markdown", () => {
    const detail: AgentEntryDetail = {
      ...listResult.items[0]!,
      content:
        '<h1>Hello</h1><p>Read <a href="https://example.com">this</a>.</p><ul><li>One</li></ul>',
      contentSource: "content",
      description: "Summary",
    }

    const markdown = formatEntryDetailMarkdown(detail)

    expect(markdown).toContain("# Example Post")
    expect(markdown).toContain("- Feed: Example Feed")
    expect(markdown).toContain("- Content source: content")
    expect(markdown).toContain("# Hello")
    expect(markdown).toContain("Read [this](https://example.com).")
    expect(markdown).toContain("- One")
  })

  it("supports summary and metadata-only content modes", () => {
    const detail: AgentEntryDetail = {
      ...listResult.items[0]!,
      content: "<p>Full body</p>",
      contentSource: "content",
      description: "Short summary",
    }

    expect(formatEntryDetailMarkdown(detail, { content: "summary" })).toContain("Short summary")
    expect(formatEntryDetailMarkdown(detail, { content: "summary" })).not.toContain("Full body")
    expect(formatEntryDetailMarkdown(detail, { content: "summary", maxChars: 5 })).toContain(
      "[Content truncated to 5 characters]",
    )

    const metadataOnly = formatEntryDetailMarkdown(detail, { content: "metadata" })
    expect(metadataOnly).toContain("- Content source: content")
    expect(metadataOnly).not.toContain("Short summary\n")
    expect(metadataOnly).not.toContain("Full body")
  })

  it("keeps metadata shape stable for markdown-sensitive values", () => {
    const detail: AgentEntryDetail = {
      ...listResult.items[0]!,
      feedTitle: "Feed\n# Injected",
      title: "Title\n## Injected",
      author: "Author\n- injected",
      content: "<p>Body</p>",
      contentSource: "content",
      description: "Summary\n# injected",
    }

    const markdown = formatEntryDetailMarkdown(detail)

    expect(markdown).toContain("# Title ## Injected")
    expect(markdown).toContain("- Feed: Feed # Injected")
    expect(markdown).toContain("- Author: Author - injected")
    expect(markdown).toContain("- Description: Summary # injected")
  })
})

describe("formatFeedsMarkdown", () => {
  it("includes feed title, id, unread count, category, and URLs", () => {
    const feeds: AgentFeedsListResult = {
      items: [
        {
          id: "feed-1",
          subscriptionId: "feed/feed-1",
          title: "Example Feed",
          url: "https://example.com/rss.xml",
          siteUrl: "https://example.com",
          category: "Tech",
          unreadCount: 3,
        },
      ],
    }

    const markdown = formatFeedsMarkdown(feeds)

    expect(markdown).toContain("# Suhui Feeds")
    expect(markdown).toContain("## Tech")
    expect(markdown).toContain("### Example Feed")
    expect(markdown).toContain("- ID: `feed-1`")
    expect(markdown).toContain("- Unread: 3")
    expect(markdown).toContain("- Site URL: https://example.com")
    expect(markdown).toContain("- Feed URL: https://example.com/rss.xml")
  })

  it("keeps category headings stable", () => {
    const markdown = formatFeedsMarkdown({
      items: [
        {
          id: "feed-1",
          subscriptionId: "feed/feed-1",
          title: "Example Feed",
          url: null,
          siteUrl: null,
          category: "Tech\n# Injected",
          unreadCount: 0,
        },
      ],
    })

    expect(markdown).toContain("## Tech # Injected")
    expect(markdown).not.toContain("\n# Injected")
  })
})

describe("htmlToMarkdown", () => {
  it("handles common article HTML without dependencies", () => {
    const markdown = htmlToMarkdown(
      "<style>.x{}</style><script>alert(1)</script><h2>Title &amp; More</h2><p>Line<br>next</p><pre><code>const x = 1;</code></pre>",
    )

    expect(markdown).not.toContain("alert")
    expect(markdown).toContain("## Title & More")
    expect(markdown).toContain("Line\nnext")
    expect(markdown).toContain("```")
    expect(markdown).toContain("const x = 1;")
  })

  it("preserves plain angle brackets and code examples", () => {
    const markdown = htmlToMarkdown(
      '<p>Use 1 < 2 and 3 > 2.</p><pre><code>if (a < b) return "<tag>";</code></pre>',
    )

    expect(markdown).toContain("Use 1 < 2 and 3 > 2.")
    expect(markdown).toContain('if (a < b) return "<tag>";')
  })
})

describe("truncateText", () => {
  it("only truncates when explicitly bounded", () => {
    expect(truncateText("abcdef")).toBe("abcdef")
    expect(truncateText("abcdef", 4)).toBe("abcd\n\n[Content truncated to 4 characters]")
  })
})
