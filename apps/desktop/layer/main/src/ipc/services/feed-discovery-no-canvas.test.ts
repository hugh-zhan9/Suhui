import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

/**
 * HTML parsing in the main process must use the canvas-free linkedom worker
 * entry; the bare entry pulls the optional native `canvas` dependency.
 */
const BARE_LINKEDOM = /(?:from\s*|require\s*\(\s*)["']linkedom["']/
const WORKER_LINKEDOM = /from\s*["']linkedom\/worker["']/

describe("HTML 解析依赖约束", () => {
  it.each(["./feed-discovery.ts", "./site-scrape.ts"])("%s 只使用 linkedom/worker", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8")

    expect(source).toMatch(WORKER_LINKEDOM)
    expect(source).not.toMatch(BARE_LINKEDOM)
  })

  it.each(["./site-scrape-url.ts", "./feed-source-resolver.ts", "./feed-staleness.ts"])(
    "%s 不引入 DOM 依赖",
    (file) => {
      const source = readFileSync(new URL(file, import.meta.url), "utf8")

      expect(source).not.toContain("linkedom")
    },
  )

  it("约束本身能识别单引号与 require 写法", () => {
    expect(`import { DOMParser } from 'linkedom'`).toMatch(BARE_LINKEDOM)
    expect(`const x = require("linkedom")`).toMatch(BARE_LINKEDOM)
    expect(`import { DOMParser } from "linkedom/worker"`).not.toMatch(BARE_LINKEDOM)
  })
})
