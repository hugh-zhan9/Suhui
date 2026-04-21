import { describe, expect, it } from "vitest"

import { shouldShowOriginalActionButton } from "./entry-original-action"

describe("EntryTitle original action visibility", () => {
  it("defaults to hidden unless the detail layout explicitly opts in", () => {
    expect(
      shouldShowOriginalActionButton({ showOriginalAction: false, url: "https://example.com" }),
    ).toBe(false)
    expect(shouldShowOriginalActionButton({ showOriginalAction: true, url: undefined })).toBe(false)
    expect(
      shouldShowOriginalActionButton({ showOriginalAction: true, url: "https://example.com" }),
    ).toBe(true)
  })
})
