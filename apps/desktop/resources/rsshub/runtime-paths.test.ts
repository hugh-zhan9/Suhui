import { describe, expect, it } from "vitest"

import { resolveRuntimeDir } from "./runtime-paths.js"

describe("rsshub runtime paths", () => {
  it("应优先使用环境变量目录", () => {
    const result = resolveRuntimeDir({
      envValue: "/custom/logs",
      fallbackName: "logs",
      moduleUrl: "file:///official-entry.js",
    })
    expect(result).toBe("/custom/logs")
  })

  it("当模块目录退化为根目录时应回退到 cwd", () => {
    const result = resolveRuntimeDir({
      envValue: "",
      fallbackName: "logs",
      moduleUrl: "file:///official-entry.js",
    })
    expect(result).not.toBe("/logs")
  })
})
