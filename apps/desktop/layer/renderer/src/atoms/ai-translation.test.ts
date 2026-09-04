import { describe, expect, it } from "vitest"

import {
  clearOverrideForEntry,
  overrideForEntry,
  resolveTranslationVisibility,
} from "./ai-translation-state"

describe("current article translation override", () => {
  it("follows the global/action setting until the article is explicitly overridden", () => {
    expect(resolveTranslationVisibility(true, "follow-global")).toBe(true)
    expect(resolveTranslationVisibility(false, "follow-global")).toBe(false)
    expect(resolveTranslationVisibility(true, "force-off")).toBe(false)
    expect(resolveTranslationVisibility(false, "force-on")).toBe(true)
  })

  it("does not apply an override to a different article", () => {
    const state = { entryId: "entry-1", override: "force-on" as const }
    expect(overrideForEntry(state, "entry-1")).toBe("force-on")
    expect(overrideForEntry(state, "entry-2")).toBe("follow-global")
  })

  it("forgets an article override when that article is navigated away from", () => {
    const state = { entryId: "entry-1", override: "force-on" as const }
    const afterLeavingEntryOne = clearOverrideForEntry(state, "entry-1")
    expect(overrideForEntry(afterLeavingEntryOne, "entry-1")).toBe("follow-global")
    expect(clearOverrideForEntry(state, "entry-2")).toBe(state)
  })
})
