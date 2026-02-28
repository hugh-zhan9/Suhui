import { describe, expect, it } from "vitest"

import { resolveHttpErrorMessage } from "./rss-http-error"

describe("resolveHttpErrorMessage", () => {
  it("RSSHUB 错误应透传原始错误码文案", () => {
    const message = resolveHttpErrorMessage(501, "RSSHUB_ROUTE_NOT_IMPLEMENTED: /github/trending")
    expect(message).toBe("RSSHUB_ROUTE_NOT_IMPLEMENTED: /github/trending")
  })

  it("普通 HTTP 错误保持 HTTP 状态文案", () => {
    expect(resolveHttpErrorMessage(404, "Not Found")).toBe("HTTP 404")
    expect(resolveHttpErrorMessage(500, "")).toBe("HTTP 500")
  })
})
