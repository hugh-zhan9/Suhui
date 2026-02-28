import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

describe("DiscoveryContent", () => {
  it("Discover 趋势模块默认应请求 50 条", () => {
    const source = readFileSync(
      "apps/desktop/layer/renderer/src/modules/discover/DiscoveryContent.tsx",
      "utf8",
    )

    expect(source).toMatch(/<Trending\s+center\s+limit=\{50\}\s+hideHeader\s*\/>/)
  })
})
