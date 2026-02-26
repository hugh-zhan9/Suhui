import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

describe("rss parser dependency", () => {
  it("主进程 RSS 解析器不应依赖 linkedom，避免触发 canvas 可选依赖", () => {
    const source = readFileSync(resolve(__dirname, "./rss-parser.ts"), "utf8")
    expect(source).not.toContain("from \"linkedom\"")
  })
})

