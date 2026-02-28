import { describe, expect, it } from "vitest"

import { extractVideoUrlFromHtml } from "./extract-video-url"

describe("extractVideoUrlFromHtml", () => {
  it("应从 iframe 提取视频地址", () => {
    const html = `<p>test</p><iframe src="https://www.youtube.com/embed/abc123"></iframe>`
    expect(extractVideoUrlFromHtml(html)).toBe("https://www.youtube.com/embed/abc123")
  })

  it("应从 video/source 提取视频地址", () => {
    const html = `<video controls><source src="https://cdn.example.com/v.mp4" type="video/mp4"></video>`
    expect(extractVideoUrlFromHtml(html)).toBe("https://cdn.example.com/v.mp4")
  })

  it("没有视频标签时返回 null", () => {
    const html = `<p><a href="https://example.com">link</a></p>`
    expect(extractVideoUrlFromHtml(html)).toBeNull()
  })

  it("应支持转义后的 iframe 标签", () => {
    const html = `&lt;iframe src=&quot;https://www.youtube-nocookie.com/embed/xyz987&quot;&gt;&lt;/iframe&gt;`
    expect(extractVideoUrlFromHtml(html)).toBe("https://www.youtube-nocookie.com/embed/xyz987")
  })

  it("应从 a 链接提取 bilibili 视频地址", () => {
    const html = `<p><a href="https://www.bilibili.com/video/BV1T8fqBeEz4">视频</a></p>`
    expect(extractVideoUrlFromHtml(html)).toBe("https://www.bilibili.com/video/BV1T8fqBeEz4")
  })

  it("应从纯文本提取 youtube 视频地址", () => {
    const html = `<p>watch https://www.youtube.com/watch?v=abc123 now</p>`
    expect(extractVideoUrlFromHtml(html)).toBe("https://www.youtube.com/watch?v=abc123")
  })
})
