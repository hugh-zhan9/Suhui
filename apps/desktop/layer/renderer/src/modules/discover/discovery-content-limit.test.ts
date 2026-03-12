import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import path from "pathe"
import { describe, expect, it } from "vitest"

describe("DiscoveryContent", () => {
  it("Discover 趋势模块默认应请求 50 条", () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const sourcePath = path.resolve(currentDir, "DiscoveryContent.tsx")
    const source = readFileSync(sourcePath, "utf8")

    expect(source).toMatch(/<Trending\s+center\s+limit=\{50\}\s+hideHeader\s*\/>/)
  })
})
