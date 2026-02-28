import { describe, expect, it } from "vitest"

import { hasValidToken } from "./runtime-auth.js"

describe("rsshub runtime auth", () => {
  it("开启本地无鉴权模式后应始终放行", () => {
    expect(
      hasValidToken({
        requestUrl: "/github/release/vercel/next.js?token=abc",
        headers: { "x-rsshub-token": "wrong" },
        token: "secure-token",
      }),
    ).toBe(true)
  })
})
