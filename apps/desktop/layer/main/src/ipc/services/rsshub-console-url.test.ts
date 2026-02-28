import { describe, expect, it } from "vitest"

import { buildLocalRsshubConsoleUrl } from "./rsshub-console-url"

describe("buildLocalRsshubConsoleUrl", () => {
  it("端口存在时返回可打开地址", () => {
    expect(buildLocalRsshubConsoleUrl({ port: 49548, token: "abc123" })).toBe(
      "http://127.0.0.1:49548/",
    )
  })

  it("缺少端口时返回 null", () => {
    expect(buildLocalRsshubConsoleUrl({ port: null, token: "abc123" })).toBeNull()
  })

  it("不依赖 token", () => {
    expect(buildLocalRsshubConsoleUrl({ port: 49548, token: null })).toBe("http://127.0.0.1:49548/")
  })
})
