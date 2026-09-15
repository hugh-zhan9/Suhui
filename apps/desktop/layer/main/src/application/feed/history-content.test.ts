import { describe, expect, it } from "vitest"

import { extractHistoryContent } from "./history-content"

const text = "这是一篇历史文章的完整正文，包含足够的内容用于可靠提取。".repeat(30)
describe("history body extraction", () => {
  it("extracts readable text and resolves article-relative links without active HTML", () => {
    const content = extractHistoryContent(
      `<html><head><title>文章标题</title></head><body><article><h1>文章标题</h1><p onclick="alert(1)">${text}<a href="./detail">详情</a></p><script>alert(1)</script><iframe src="https://tracker.test"></iframe><img src="./photo.png" onerror="alert(2)"></article></body></html>`,
      "https://blog.test/posts/one/",
    )
    expect(content).toContain(text)
    expect(content).toContain("https://blog.test/posts/one/detail")
    expect(content).not.toMatch(/<script|<iframe|onclick|onerror/)
  })
  it("reports pages without article text", () => {
    expect(() => extractHistoryContent("<html><body></body></html>", "https://blog.test/")).toThrow(
      "无法提取",
    )
  })
})
