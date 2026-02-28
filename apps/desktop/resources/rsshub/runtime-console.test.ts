import { describe, expect, it } from "vitest"

import { buildConsoleHomeHtml } from "./runtime-console.js"

describe("rsshub runtime console home", () => {
  it("应生成包含状态与路由入口的控制台页面", () => {
    const html = buildConsoleHomeHtml({
      baseUrl: "http://127.0.0.1:49548",
      token: "abc",
      mode: "official",
    })

    expect(html).toContain("FreeFolo RSSHub")
    expect(html).toContain("/status")
    expect(html).toContain("/rsshub/routes/en")
    expect(html).toContain("/routes-index")
  })
})
