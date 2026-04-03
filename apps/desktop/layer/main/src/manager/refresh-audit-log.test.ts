import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => tmpdir()),
  },
}))

import { appendRefreshAuditLog, appendRefreshAuditTrace } from "./refresh-audit-log"

describe("appendRefreshAuditLog", () => {
  it("appends ndjson lines for refresh audit events", () => {
    const dir = mkdtempSync(join(tmpdir(), "suhui-refresh-audit-"))
    const filePath = join(dir, "refresh.log")

    appendRefreshAuditLog(
      {
        stage: "batch.completed",
        level: "info",
        source: "interval-auto",
        traceId: "trace-1",
        refreshed: 3,
        failed: 1,
      },
      filePath,
    )

    const content = readFileSync(filePath, "utf8").trim()
    const entry = JSON.parse(content)

    expect(entry).toMatchObject({
      stage: "batch.completed",
      level: "info",
      source: "interval-auto",
      traceId: "trace-1",
      refreshed: 3,
      failed: 1,
    })
    expect(typeof entry.ts).toBe("string")
  })
})

describe("appendRefreshAuditTrace", () => {
  it("records tracked batch stages for auto refresh", () => {
    const dir = mkdtempSync(join(tmpdir(), "suhui-refresh-trace-"))
    const filePath = join(dir, "refresh.log")

    appendRefreshAuditTrace(
      {
        traceId: "trace-2",
        source: "startup-auto",
        mode: "batch",
      },
      "error",
      "batch.feed_failed",
      {
        targetFeedId: "feed_1",
        reason: "timeout",
      },
      filePath,
    )

    const content = readFileSync(filePath, "utf8").trim()
    const entry = JSON.parse(content)

    expect(entry).toMatchObject({
      traceId: "trace-2",
      source: "startup-auto",
      mode: "batch",
      stage: "batch.feed_failed",
      level: "error",
      targetFeedId: "feed_1",
      reason: "timeout",
    })
  })

  it("ignores non-batch or untracked refresh stages", () => {
    const dir = mkdtempSync(join(tmpdir(), "suhui-refresh-ignore-"))
    const filePath = join(dir, "refresh.log")

    appendRefreshAuditTrace(
      {
        traceId: "trace-3",
        source: "manual-single",
        mode: "single",
      },
      "info",
      "refresh.completed",
      {
        entriesCount: 12,
      },
      filePath,
    )

    expect(() => readFileSync(filePath, "utf8")).toThrow()
  })
})
