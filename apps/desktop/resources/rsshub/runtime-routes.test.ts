import { describe, expect, it } from "vitest"

import { handleKnownRoute } from "./runtime-routes"

describe("rsshub runtime routes", () => {
  it("应处理 /rsshub/routes 并返回 RSS 清单", () => {
    const result = handleKnownRoute("/rsshub/routes/en", "http://127.0.0.1:12000")
    expect(result).not.toBeNull()
    expect(result?.statusCode).toBe(200)
    expect(result?.contentType).toContain("application/rss+xml")
    expect(result?.body).toContain("<rss")
    expect(result?.body).toContain("FreeFolo Built-in RSSHub Routes")
  })

  it("未知路由应返回 null 交由上层处理", () => {
    const result = handleKnownRoute("/github/trending", "http://127.0.0.1:12000")
    expect(result).toBeNull()
  })
})
