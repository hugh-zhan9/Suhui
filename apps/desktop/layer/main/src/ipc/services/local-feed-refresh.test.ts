import { describe, expect, it } from "vitest"

import {
  isLocalFeedRefreshCandidate,
  localFeedRefreshBatchConcurrency,
  localFeedRefreshRequestTimeoutMs,
} from "./local-feed-refresh"

describe("isLocalFeedRefreshCandidate", () => {
  it("accepts local feeds with a null owner", () => {
    expect(
      isLocalFeedRefreshCandidate({
        url: "https://example.com/rss.xml",
        ownerUserId: null,
      }),
    ).toBe(true)
  })

  it("accepts legacy local feeds with an empty-string owner", () => {
    expect(
      isLocalFeedRefreshCandidate({
        url: "https://example.com/rss.xml",
        ownerUserId: "",
      }),
    ).toBe(true)
  })

  it("accepts owned feeds when a direct rss url is available", () => {
    expect(
      isLocalFeedRefreshCandidate({
        url: "https://example.com/rss.xml",
        ownerUserId: "user_1",
      }),
    ).toBe(true)
  })

  it("exports refresh tuning constants", () => {
    expect(localFeedRefreshRequestTimeoutMs).toBe(15_000)
    expect(localFeedRefreshBatchConcurrency).toBe(8)
  })
})
