import { describe, expect, it } from "vitest"

import { hasRuleActions, matchesEntryRule, normalizeRuleTerms } from "../local-reading/domain"

describe("entry rule behavior", () => {
  it("uses OR within source/keyword groups and AND between groups", () => {
    const rule = { feedIds: ["feed-1", "feed-2"], titleKeywords: ["Rust", "TypeScript"] }
    expect(matchesEntryRule(rule, { feedId: "feed-1", title: "Rust 1.90 released" })).toBe(true)
    expect(matchesEntryRule(rule, { feedId: "feed-3", title: "Rust 1.90 released" })).toBe(false)
    expect(matchesEntryRule(rule, { feedId: "feed-1", title: "Go 1.30 released" })).toBe(false)
  })

  it("normalizes terms and rejects no-op action sets", () => {
    expect(normalizeRuleTerms([" Rust ", "rust", ""])).toEqual(["rust"])
    expect(hasRuleActions({ tags: [" "] })).toBe(false)
    expect(hasRuleActions({ addToReadingQueue: true })).toBe(true)
  })
})
