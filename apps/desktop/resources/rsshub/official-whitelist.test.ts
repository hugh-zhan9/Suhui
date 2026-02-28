import { describe, expect, it } from "vitest"

import { createWhitelistMatcher } from "./official-whitelist.js"

describe("lite rsshub whitelist", () => {
  it("应允许静态路由", () => {
    const matcher = createWhitelistMatcher(["/github/trending", "/rsshub/routes/:lang?"])
    expect(matcher("/github/trending")).toBe(true)
  })

  it("应允许带参数路由", () => {
    const matcher = createWhitelistMatcher([
      "/github/release/:owner/:repo",
      "/github/commit/:owner/:repo",
    ])
    expect(matcher("/github/release/vercel/next.js")).toBe(true)
    expect(matcher("/github/commit/vercel/next.js")).toBe(true)
  })

  it("应拒绝白名单外路由", () => {
    const matcher = createWhitelistMatcher(["/github/release/:owner/:repo"])
    expect(matcher("/weibo/user/123")).toBe(false)
    expect(matcher("/github/release/vercel")).toBe(false)
  })
})
