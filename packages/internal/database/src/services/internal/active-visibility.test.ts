import { describe, expect, it } from "vitest"

import { isEntryVisibleForActiveRelations } from "./active-visibility"

const state = {
  activeFeedIds: new Set(["feed-1"]),
  activeListIds: new Set(["list-1"]),
  activeInboxIds: new Set(["inbox-1"]),
  sourceIdBySubscriptionId: new Map<string, string>(),
}

describe("isEntryVisibleForActiveRelations", () => {
  it("treats feed-linked entries as active when the feed subscription is active", () => {
    expect(
      isEntryVisibleForActiveRelations(
        { id: "entry-1", feedId: "feed-1", inboxHandle: null, sources: null } as any,
        state,
      ),
    ).toBe(true)
  })

  it("treats list-sourced entries as active when one of their sources is active", () => {
    expect(
      isEntryVisibleForActiveRelations(
        { id: "entry-2", feedId: "feed-x", inboxHandle: null, sources: ["feed", "list-1"] } as any,
        state,
      ),
    ).toBe(true)
  })

  it("hides entries when no active root relation remains", () => {
    expect(
      isEntryVisibleForActiveRelations(
        { id: "entry-3", feedId: "feed-x", inboxHandle: null, sources: ["feed", "list-x"] } as any,
        state,
      ),
    ).toBe(false)
  })
})
