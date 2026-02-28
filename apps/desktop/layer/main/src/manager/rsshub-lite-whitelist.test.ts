import { describe, expect, it } from "vitest"

import {
  normalizeRsshubLiteWhitelist,
  parseRsshubLiteWhitelistText,
  stringifyRsshubLiteWhitelist,
} from "./rsshub-lite-whitelist"

describe("rsshub lite whitelist", () => {
  it("应归一化白名单并去重", () => {
    const list = normalizeRsshubLiteWhitelist([
      "github/trending",
      "/github/trending",
      "   /sspai/index   ",
      "",
    ])
    expect(list).toEqual(["/github/trending", "/sspai/index"])
  })

  it("应支持文本按行解析", () => {
    const list = parseRsshubLiteWhitelistText("github/trending\n\n/sspai/index\n")
    expect(list).toEqual(["/github/trending", "/sspai/index"])
  })

  it("应支持文本序列化", () => {
    expect(stringifyRsshubLiteWhitelist(["/github/trending", "/sspai/index"])).toBe(
      "/github/trending\n/sspai/index",
    )
  })
})
