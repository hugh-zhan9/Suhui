import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("reading workflows settings icon", () => {
  it("resolves its icon class to an SVG in the bundled mgc collection", () => {
    const pageSource = readFileSync(
      path.resolve("src/pages/settings/(settings)/reading-workflows.tsx"),
      "utf8",
    )
    const iconClass = pageSource.match(/icon:\s*"(i-mgc-[^"]+)"/)?.[1]

    expect(iconClass).toBeTruthy()

    const iconFilename = `${iconClass!.slice("i-mgc-".length).replaceAll("-", "_")}.svg`
    const iconPath = path.resolve("../../../../icons/mgc", iconFilename)

    expect(existsSync(iconPath)).toBe(true)
  })
})
