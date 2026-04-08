import { describe, expect, it } from "vitest"

import { transformEntryFromApi } from "./transforms"

describe("remote entry transforms", () => {
  it("keeps missing publishedAt as unknown instead of faking current time", () => {
    const entry = transformEntryFromApi({
      id: "entry-1",
      feedId: "feed-1",
      title: "Entry 1",
      insertedAt: 1_710_000_000_000,
      publishedAt: null,
    })

    expect(entry.publishedAt).toBe(0)
    expect(entry.insertedAt).toBe(1_710_000_000_000)
  })
})
