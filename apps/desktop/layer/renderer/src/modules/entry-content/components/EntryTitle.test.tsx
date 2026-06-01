import { describe, expect, it } from "vitest"

import {
  shouldShowOriginalActionButton,
  shouldShowReadabilityActionButton,
} from "./entry-original-action"

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

describe("EntryTitle readability action visibility", () => {
  it("uses the same detail-layout and url gate as the original page action", () => {
    expect(
      shouldShowReadabilityActionButton({
        showOriginalAction: false,
        url: "https://example.com",
      }),
    ).toBe(false)
    expect(
      shouldShowReadabilityActionButton({
        showOriginalAction: true,
        url: undefined,
      }),
    ).toBe(false)
    expect(
      shouldShowReadabilityActionButton({
        showOriginalAction: true,
        url: "https://example.com",
      }),
    ).toBe(true)
  })
})
