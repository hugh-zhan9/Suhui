import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("rsshub runtime entry deps", () => {
  it("运行时脚本不应依赖 pathe", () => {
    const files = [
      "apps/desktop/resources/rsshub/index.js",
      "apps/desktop/resources/rsshub/official-entry.js",
      "apps/desktop/resources/rsshub/runtime-cache.js",
    ]

    for (const file of files) {
      expect(read(file)).not.toMatch(/from\s+["']pathe["']/)
    }
  })
})
