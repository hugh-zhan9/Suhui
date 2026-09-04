import { describe, expect, it } from "vitest"

import { resolveEntryTranslationEnabled } from "./policy"

describe("entry translation enable policy", () => {
  it("keeps list action settings while allowing current-article force-off", () => {
    expect(resolveEntryTranslationEnabled(false, true, true)).toBe(true)
    expect(resolveEntryTranslationEnabled(false, true, false)).toBe(false)
    expect(resolveEntryTranslationEnabled(true, false, false)).toBe(true)
  })
})
