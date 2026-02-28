import { describe, expect, it } from "vitest"

import { shouldForwardRendererConsoleError } from "./renderer-console-filter"

describe("renderer console filter", () => {
  it("低等级日志不转发", () => {
    expect(
      shouldForwardRendererConsoleError({
        level: 1,
        message: "test",
        sourceId: "http://localhost:5173/src/main.tsx",
      }),
    ).toBe(false)
  })

  it("来自 electron-log 的日志不回流", () => {
    expect(
      shouldForwardRendererConsoleError({
        level: 2,
        message: "11:00 [Renderer Error] boom",
        sourceId: "http://localhost:5173/node_modules/.vite/deps/electron-log.js?v=1",
      }),
    ).toBe(false)
  })

  it("带有 [Renderer Error] 标记的消息不重复转发", () => {
    expect(
      shouldForwardRendererConsoleError({
        level: 2,
        message: "[Renderer Error] xxx",
        sourceId: "http://localhost:5173/src/app.tsx",
      }),
    ).toBe(false)
  })

  it("普通错误日志可以转发", () => {
    expect(
      shouldForwardRendererConsoleError({
        level: 2,
        message: "No HydrateFallback element provided",
        sourceId: "http://localhost:5173/node_modules/.vite/deps/chunk-abc.js",
      }),
    ).toBe(true)
  })
})
