import { describe, expect, it } from "vitest"

import { buildRendererErrorPayload, buildRendererRejectionPayload } from "./renderer-error-log"

describe("renderer-error-log", () => {
  it("应序列化 window error 事件", () => {
    const payload = buildRendererErrorPayload({
      message: "boom",
      filename: "app.js",
      lineno: 12,
      colno: 9,
      error: { stack: "Error: boom\n at x" },
    })

    expect(payload.type).toBe("window-error")
    expect(payload.message).toBe("boom")
    expect(payload.location).toContain("app.js:12:9")
    expect(payload.stack).toContain("Error: boom")
  })

  it("应序列化 unhandledrejection 事件", () => {
    const payload = buildRendererRejectionPayload({
      reason: new Error("reject-boom"),
    })

    expect(payload.type).toBe("unhandled-rejection")
    expect(payload.message).toBe("reject-boom")
    expect(payload.stack).toContain("Error: reject-boom")
  })

  it("未知 rejection reason 应可读", () => {
    const payload = buildRendererRejectionPayload({ reason: { code: 500, msg: "x" } })
    expect(payload.message).toContain("code")
  })
})
