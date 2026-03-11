import { describe, expect, it } from "vitest"

import { isRsshubUrlLike, resolveRsshubUrl } from "./rsshub-url"

describe("resolveRsshubUrl", () => {
  it("应识别 rsshub.app 与 rsshub:// 形式", () => {
    expect(isRsshubUrlLike("https://rsshub.app/github/trending", [])).toBe(true)
    expect(isRsshubUrlLike("rsshub://github/trending?language=js", [])).toBe(true)
    expect(isRsshubUrlLike("https://example.com/feed.xml", [])).toBe(false)
  })

  it("非 RSSHub URL 应原样返回", () => {
    const result = resolveRsshubUrl({
      url: "https://example.com/feed.xml",
      customHosts: [],
      customBaseUrl: "",
      allowPublicFallback: false,
    })

    expect(result).toEqual({ resolvedUrl: "https://example.com/feed.xml", token: null })
  })

  it("配置外部 RSSHub 后应改写到自定义地址并保留参数", () => {
    const result = resolveRsshubUrl({
      url: "https://rsshub.app/github/trending?since=daily#top",
      customHosts: [],
      customBaseUrl: "https://rsshub.myself.dev",
      allowPublicFallback: false,
    })

    expect(result).toEqual({
      resolvedUrl: "https://rsshub.myself.dev/github/trending?since=daily#top",
      token: null,
    })
  })

  it("rsshub:// 协议应改写到外部 RSSHub", () => {
    const result = resolveRsshubUrl({
      url: "rsshub://github/trending?language=js",
      customHosts: [],
      customBaseUrl: "https://rsshub.myself.dev",
      allowPublicFallback: false,
    })

    expect(result).toEqual({
      resolvedUrl: "https://rsshub.myself.dev/github/trending?language=js",
      token: null,
    })
  })

  it("未配置外部 RSSHub 时应抛结构化错误", () => {
    expect(() =>
      resolveRsshubUrl({
        url: "https://rsshub.app/github/trending",
        customHosts: [],
        customBaseUrl: "",
        allowPublicFallback: false,
      }),
    ).toThrowError(/RSSHUB_EXTERNAL_UNCONFIGURED/)
  })

  it("允许使用官方默认时应回退到 rsshub.app", () => {
    const result = resolveRsshubUrl({
      url: "https://rsshub.app/github/trending?since=daily",
      customHosts: [],
      customBaseUrl: "",
      allowPublicFallback: true,
    })

    expect(result).toEqual({
      resolvedUrl: "https://rsshub.app/github/trending?since=daily",
      token: null,
    })
  })

  it("命中自定义 RSSHub 域名时应保持原始地址，不依赖本地实例状态", () => {
    const result = resolveRsshubUrl({
      url: "https://rsshub.myself.dev/github/trending?since=daily",
      customHosts: ["rsshub.myself.dev"],
      customBaseUrl: "",
      allowPublicFallback: false,
    })

    expect(result).toEqual({
      resolvedUrl: "https://rsshub.myself.dev/github/trending?since=daily",
      token: null,
    })
  })
})
