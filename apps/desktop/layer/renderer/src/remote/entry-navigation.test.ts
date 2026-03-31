import { describe, expect, it } from "vitest"

import { getPreferredEntryIdAfterReadChange } from "./entry-navigation"

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
