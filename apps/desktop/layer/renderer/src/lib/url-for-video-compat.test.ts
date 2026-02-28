import { describe, expect, it } from "vitest"

import { transformVideoUrl } from "@follow/utils/url-for-video"

describe("url-for-video compat", () => {
  it("应支持 bilibili html5mobileplayer 链接", () => {
    const url =
      "https://www.bilibili.com/blackboard/html5mobileplayer.html?aid=123&cid=undefined&bvid=BV1T8fqBeEz4"
    expect(transformVideoUrl({ url, isIframe: true })).toBe(url)
  })

  it("应支持 youtu.be 短链", () => {
    const url = "https://youtu.be/AbCdEf12345"
    const transformed = transformVideoUrl({ url, isIframe: true })
    expect(transformed).toContain("youtube-nocookie.com/embed/AbCdEf12345")
  })

  it("应支持 m.youtube.com/watch 链接", () => {
    const url = "https://m.youtube.com/watch?v=QWERTY9876A"
    const transformed = transformVideoUrl({ url, isIframe: true })
    expect(transformed).toContain("youtube-nocookie.com/embed/QWERTY9876A")
  })
})
