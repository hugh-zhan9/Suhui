import { describe, expect, it } from "vitest"

import { normalizeSourceContentPanelSrc } from "./components/source-content-state"

describe("EntryContent source panel src", () => {
  it("drops empty and fake sources so the panel only mounts for real URLs", () => {
    expect(normalizeSourceContentPanelSrc(undefined)).toBeNull()
    expect(normalizeSourceContentPanelSrc(null)).toBeNull()
    expect(normalizeSourceContentPanelSrc("#")).toBeNull()
    expect(normalizeSourceContentPanelSrc("https://example.com")).toBe("https://example.com")
  })
})
