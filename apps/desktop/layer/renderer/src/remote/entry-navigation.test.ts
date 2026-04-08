import { describe, expect, it } from "vitest"

import { getPreferredEntryIdAfterReadChange, sortEntries } from "./entry-navigation"

const entries = [
  { id: "entry_1", read: false },
  { id: "entry_2", read: false },
  { id: "entry_3", read: false },
]

describe("getPreferredEntryIdAfterReadChange", () => {
  it("keeps the current entry when unread-only mode is off", () => {
    expect(
      getPreferredEntryIdAfterReadChange({
        entries,
        activeEntryId: "entry_2",
        changedEntryId: "entry_2",
        nextRead: true,
        unreadOnly: false,
      }),
    ).toBe("entry_2")
  })

  it("moves to the next entry when the active unread entry becomes read in unread-only mode", () => {
    expect(
      getPreferredEntryIdAfterReadChange({
        entries,
        activeEntryId: "entry_2",
        changedEntryId: "entry_2",
        nextRead: true,
        unreadOnly: true,
      }),
    ).toBe("entry_3")
  })

  it("falls back to the previous entry when there is no next entry in unread-only mode", () => {
    expect(
      getPreferredEntryIdAfterReadChange({
        entries,
        activeEntryId: "entry_3",
        changedEntryId: "entry_3",
        nextRead: true,
        unreadOnly: true,
      }),
    ).toBe("entry_2")
  })

  it("does not change selection when another entry is updated", () => {
    expect(
      getPreferredEntryIdAfterReadChange({
        entries,
        activeEntryId: "entry_2",
        changedEntryId: "entry_1",
        nextRead: true,
        unreadOnly: true,
      }),
    ).toBe("entry_2")
  })
})

describe("sortEntries", () => {
  const sortableEntries = [
    { id: "entry_1", read: true, publishedAt: 100 },
    { id: "entry_2", read: false, publishedAt: 200 },
    { id: "entry_3", read: false, publishedAt: 150 },
  ]

  it("sorts newest first", () => {
    expect(sortEntries(sortableEntries, "newest").map((entry) => entry.id)).toEqual([
      "entry_2",
      "entry_3",
      "entry_1",
    ])
  })

  it("sorts oldest first", () => {
    expect(sortEntries(sortableEntries, "oldest").map((entry) => entry.id)).toEqual([
      "entry_1",
      "entry_3",
      "entry_2",
    ])
  })

  it("puts unread entries first", () => {
    expect(sortEntries(sortableEntries, "unread-first").map((entry) => entry.id)).toEqual([
      "entry_2",
      "entry_3",
      "entry_1",
    ])
  })

  it("uses insertedAt as a tie-breaker when publishedAt is the same", () => {
    const tiedEntries = [
      { id: "entry_1", read: false, publishedAt: 100, insertedAt: 10 },
      { id: "entry_2", read: false, publishedAt: 100, insertedAt: 30 },
      { id: "entry_3", read: false, publishedAt: 100, insertedAt: 20 },
    ]

    expect(sortEntries(tiedEntries, "newest").map((entry) => entry.id)).toEqual([
      "entry_2",
      "entry_3",
      "entry_1",
    ])
  })
})
