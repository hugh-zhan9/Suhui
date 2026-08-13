import { describe, expect, it } from "vitest"

import {
  canonicalizeEntryUrl,
  chooseClusterRepresentative,
  createEntryFingerprint,
} from "./fingerprint"

describe("entry deduplication", () => {
  it("removes tracking parameters from canonical URLs", () => {
    expect(
      canonicalizeEntryUrl("HTTPS://Example.com:443/post/?utm_source=rss&b=2&a=1#section"),
    ).toBe("https://example.com/post?a=1&b=2")
    expect(createEntryFingerprint({ url: "https://example.com/post?utm_medium=rss" })).toEqual(
      createEntryFingerprint({ url: "https://example.com/post" }),
    )
  })

  it("falls back to normalized title and content when URL is absent", () => {
    expect(
      createEntryFingerprint({
        title: "  Same—Story ",
        content:
          "This is enough repeated body content to create a stable fingerprint for the article.",
      }),
    ).toEqual(
      createEntryFingerprint({
        title: "same story",
        content:
          "This is enough repeated body content to create a stable fingerprint for the article!",
      }),
    )
  })

  it("chooses manual, invested, complete, then earliest representatives", () => {
    const candidates = [
      { id: "early", publishedAt: 1, contentLength: 100, hasUserInvestment: false },
      { id: "complete", publishedAt: 2, contentLength: 500, hasUserInvestment: false },
      { id: "invested", publishedAt: 3, contentLength: 10, hasUserInvestment: true },
    ]
    expect(chooseClusterRepresentative(candidates)).toBe("invested")
    expect(chooseClusterRepresentative(candidates, "early")).toBe("early")
  })
})
