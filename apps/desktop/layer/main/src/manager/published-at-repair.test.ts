import { describe, expect, it } from "vitest"

import {
  buildLooseIdentityKeys,
  isSuspiciousPublishedAt,
  parsePublishedAtRepairArgs,
  shouldRepairPublishedAt,
} from "./published-at-repair"

describe("published-at repair helpers", () => {
  it("parses cli args with defaults and overrides", () => {
    expect(
      parsePublishedAtRepairArgs([
        "--mode",
        "apply",
        "--feed-id",
        "feed-1",
        "--limit-per-feed",
        "100",
        "--suspicious-window-ms",
        "3000",
        "--min-correction-ms",
        "60000",
        "--request-timeout-ms",
        "8000",
        "--output",
        "report.json",
      ]),
    ).toEqual({
      help: false,
      mode: "apply",
      feedId: "feed-1",
      limitPerFeed: 100,
      suspiciousWindowMs: 3000,
      minCorrectionMs: 60000,
      requestTimeoutMs: 8000,
      output: "report.json",
    })
  })

  it("detects suspicious publishedAt when it is nearly equal to insertedAt", () => {
    expect(
      isSuspiciousPublishedAt({
        publishedAt: 1_000_000,
        insertedAt: 1_002_000,
        suspiciousWindowMs: 5_000,
      }),
    ).toBe(true)

    expect(
      isSuspiciousPublishedAt({
        publishedAt: 1_000_000,
        insertedAt: 2_000_000,
        suspiciousWindowMs: 5_000,
      }),
    ).toBe(false)
  })

  it("only repairs high-confidence entries with materially different remote publishedAt", () => {
    expect(
      shouldRepairPublishedAt({
        localPublishedAt: 1_000_000,
        localInsertedAt: 1_001_000,
        remotePublishedAt: 100_000,
        suspiciousWindowMs: 5_000,
        minCorrectionMs: 60_000,
      }),
    ).toBe(true)

    expect(
      shouldRepairPublishedAt({
        localPublishedAt: 1_000_000,
        localInsertedAt: 1_001_000,
        remotePublishedAt: 999_500,
        suspiciousWindowMs: 5_000,
        minCorrectionMs: 60_000,
      }),
    ).toBe(false)
  })

  it("builds loose identity keys in stable priority order", () => {
    expect(
      buildLooseIdentityKeys({
        guid: "guid-1",
        url: "https://example.com/a",
        title: "Hello",
      }),
    ).toEqual(["guid:guid-1", "url:https://example.com/a", "title:Hello"])
  })
})
