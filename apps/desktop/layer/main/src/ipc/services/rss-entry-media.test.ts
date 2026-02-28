import { describe, expect, it } from "vitest"

import { buildEntryMediaPayload } from "./rss-entry-media"

describe("buildEntryMediaPayload", () => {
  it("应从正文提取图片与视频媒体", () => {
    const html = `<p>hello</p><iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe><img src="https://img.example.com/cover.jpg"/>`
    const result = buildEntryMediaPayload({
      content: html,
      url: "https://www.youtube.com/watch?v=abc123",
    })

    expect(result.media.some((item) => item.type === "video")).toBe(true)
    expect(result.media.some((item) => item.type === "photo")).toBe(true)
    expect(result.attachments.some((item) => item.mime_type === "text/html")).toBe(true)
  })

  it("应兼容转义的 HTML 内容", () => {
    const html = `&lt;img src=&quot;https://img.example.com/a.png&quot;&gt;&lt;iframe src=&quot;https://player.bilibili.com/player.html?bvid=BV1x&quot;&gt;&lt;/iframe&gt;`
    const result = buildEntryMediaPayload({ content: html, url: "https://www.bilibili.com/video/BV1x" })

    expect(result.media.some((item) => item.type === "photo")).toBe(true)
    expect(result.media.some((item) => item.type === "video")).toBe(true)
  })

  it("应从 a 链接提取 bilibili 视频媒体", () => {
    const html = `<p><a href="https://www.bilibili.com/video/BV1T8fqBeEz4">b站视频</a></p>`
    const result = buildEntryMediaPayload({ content: html, url: "https://rsshub.app/bilibili/weekly" })

    expect(result.media.some((item) => item.type === "video")).toBe(true)
    expect(result.attachments.some((item) => item.url.includes("bilibili.com/video/"))).toBe(true)
  })

  it("应从纯文本提取 youtube 视频媒体", () => {
    const html = `<p>watch https://www.youtube.com/watch?v=abc123 now</p>`
    const result = buildEntryMediaPayload({ content: html, url: "https://rsshub.app/youtube/user/test" })

    expect(result.media.some((item) => item.type === "video")).toBe(true)
    expect(result.attachments.some((item) => item.url.includes("youtube.com/watch"))).toBe(true)
  })
})
