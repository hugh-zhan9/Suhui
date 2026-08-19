import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { normalizeSourceContentPanelSrc } from "./components/source-content-state"

describe("EntryContent source panel src", () => {
  it("drops empty and fake sources so the panel only mounts for real URLs", () => {
    expect(normalizeSourceContentPanelSrc(undefined)).toBeNull()
    expect(normalizeSourceContentPanelSrc(null)).toBeNull()
    expect(normalizeSourceContentPanelSrc("#")).toBeNull()
    expect(normalizeSourceContentPanelSrc("https://example.com")).toBe("https://example.com")
  })

  it("does not delay article switches with a fixed Motion transition", () => {
    const relativePath = "src/modules/entry-content/EntryContent.tsx"
    const sourcePath = [
      resolve(process.cwd(), relativePath),
      resolve(process.cwd(), "apps/desktop/layer/renderer", relativePath),
    ].find(existsSync)
    expect(sourcePath).toBeDefined()
    const source = readFileSync(sourcePath!, "utf8")

    expect(source).not.toContain("contentVariants")
    expect(source).not.toContain("Spring.presets.smooth")
    expect(source).not.toContain("useAnimationControls")
  })
})
