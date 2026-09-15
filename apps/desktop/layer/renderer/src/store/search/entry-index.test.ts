import { describe, expect, it } from "vitest"

import { SEARCH_RESULT_LIMIT } from "./constants"
import { EntrySearchIndex } from "./entry-index"

describe("background full text index", () => {
  it("caps broad matches without excluding later documents or returning their bodies", () => {
    const index = new EntrySearchIndex()
    index.add(
      Array.from({ length: 250 }, (_, i) => ({
        id: `entry-${i}`,
        feedId: "feed",
        title: "Common article",
        content: `${"正文".repeat(2000)}${i === 249 ? "UniqueTailKeyword" : "common"}`,
        description: null,
        localNotes: [],
        localHighlights: [],
        localTags: [],
      })),
    )
    expect(index.search("common")).toHaveLength(SEARCH_RESULT_LIMIT)
    expect(index.search("Comon article")).toEqual([])
    expect(index.search("UniqueTailKeyword")[0]).toMatchObject({
      id: "entry-249",
      feedId: "feed",
      title: "Common article",
    })
    const hit = index.search("UniqueTailKeyword")[0]!
    expect(hit.snippet?.text).toContain("UniqueTailKeyword")
    expect(hit.snippet!.text.length).toBeLessThan(200)
    expect(hit).not.toHaveProperty("content")
    expect(index.search(" ")).toEqual([])
  })
})

const document = {
  id: "entry",
  feedId: "active",
  title: "Cursor &amp; AI",
  content:
    '<p>Before <b>Cursor</b> &amp; after</p><a href="https://hidden-attribute.test">Link</a>',
  description: "摘要独特词",
  localNotes: ["笔记独特词"],
  localHighlights: ["高亮独特词"],
  localTags: ["标签独特词"],
}
it("returns decoded, highlighted context without HTML or attribute matches", () => {
  const index = new EntrySearchIndex()
  index.add([document])
  const hit = index.search("cursor")[0]!
  expect(hit.title).toBe("Cursor & AI")
  expect(hit.titleMatches).toEqual([[0, 6]])
  expect(hit.snippet).toMatchObject({
    field: "content",
    text: "Before Cursor & after Link",
    matches: [[7, 13]],
  })
  expect(index.search("hidden-attribute")).toEqual([])
  expect(index.search("摘要独特词")[0]!.snippet?.field).toBe("description")
  expect(index.search("笔记独特词")[0]!.snippet?.field).toBe("note")
  expect(index.search("高亮独特词")[0]!.snippet?.field).toBe("highlight")
  expect(index.search("标签独特词")[0]!.snippet?.field).toBe("tag")
  expect(index.search("笔记独特词", "title")).toEqual([])
  expect(index.search("cursor", "title")[0]!.snippet).toBeUndefined()
  expect(index.search("Cursr", "title")).toEqual([])
})
it("filters inactive sources before applying the result limit, for both search scopes", () => {
  const index = new EntrySearchIndex()
  index.add([
    ...Array.from({ length: 110 }, (_, i) => ({
      ...document,
      id: `old-${i}`,
      feedId: "cancelled",
    })),
    document,
  ])
  expect(index.search("Cursor", "all", ["active"]).map((hit) => hit.id)).toEqual(["entry"])
  expect(index.search("Cursor", "title", ["active"]).map((hit) => hit.id)).toEqual(["entry"])
  expect(index.search("Cursor", "all", [])).toEqual([])
})
it("treats punctuation as literal text when highlighting", () => {
  const index = new EntrySearchIndex()
  index.add([{ ...document, title: "Use C++ (a.b)" }])
  expect(index.search("C++", "title")[0]!.titleMatches).toEqual([[4, 7]])
})

it("matches the complete cursor keyword instead of scattered letters from unrelated titles", () => {
  const index = new EntrySearchIndex()
  const titles = [
    "深入研究 BeanFactoryPostProcessor",
    "focus()行为新增focusVisible控制",
    "autoresearch：全自动化软件开发",
    "Chrome插件折腾之路",
    "AzureOpenAI申请过程",
    "新玩具-Keychron-K3-Pro",
    "Cerebras用一张赎身契",
    "Sora的死与生",
    "Cursor 使用指南",
    "升级 CURSOR 编辑器",
  ]
  index.add(titles.map((title, i) => ({ ...document, id: String(i), title, content: "无关正文" })))
  for (const scope of ["title", "all"] as const) {
    const results = index.search("cursor", scope)
    expect(results.map((item) => item.title)).toEqual(["Cursor 使用指南", "升级 CURSOR 编辑器"])
    for (const item of results) {
      expect(item.titleMatches).toHaveLength(1)
      const [start, end] = item.titleMatches![0]!
      expect(item.title!.slice(start, end).toLowerCase()).toBe("cursor")
    }
  }
  expect(index.search("cursro", "title")).toEqual([])
})
