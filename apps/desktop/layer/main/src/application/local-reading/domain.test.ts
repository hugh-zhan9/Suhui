import { describe, expect, it } from "vitest"

import {
  completeQueueItem,
  hasRuleActions,
  matchesEntryRule,
  normalizeTags,
  requeue,
} from "./domain"

describe("local reading domain", () => {
  it("matches source and title groups with AND semantics", () => {
    const rule = { feedIds: ["feed-1"], titleKeywords: ["TypeScript", "Rust"] }
    expect(matchesEntryRule(rule, { feedId: "feed-1", title: "TypeScript 6" })).toBe(true)
    expect(matchesEntryRule(rule, { feedId: "feed-2", title: "TypeScript 6" })).toBe(false)
    expect(matchesEntryRule(rule, { feedId: "feed-1", title: "Go 2" })).toBe(false)
  })

  it("rejects empty rules and normalizes tags", () => {
    expect(
      matchesEntryRule({ feedIds: [], titleKeywords: [] }, { feedId: null, title: null }),
    ).toBe(false)
    expect(normalizeTags([" work ", "work", ""])).toEqual(["work"])
    expect(hasRuleActions({ tags: [" "] })).toBe(false)
  })

  it("keeps queue completion independent and idempotent", () => {
    const pending = requeue(null, 10)
    const completed = completeQueueItem(pending, 20)
    expect(completeQueueItem(completed, 30).completedAt).toBe(20)
    expect(requeue(completed, 40)).toEqual({
      status: "pending",
      addedAt: 40,
      completedAt: null,
      updatedAt: 40,
    })
  })
})
