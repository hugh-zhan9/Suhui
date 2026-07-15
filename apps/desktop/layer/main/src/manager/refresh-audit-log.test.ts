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
        batchId: "batch-1",
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
      batchId: "batch-1",
      refreshed: 3,
      failed: 1,
    })
    expect(typeof entry.ts).toBe("string")
  })

  it("retains stable runner skip reasons", () => {
    const dir = mkdtempSync(join(tmpdir(), "suhui-refresh-skip-"))
    const filePath = join(dir, "refresh.log")

    appendRefreshAuditLog(
      {
        stage: "runner.skipped",
        level: "warn",
        source: "startup-auto",
        reason: "db_cutover_in_progress",
      },
      filePath,
    )

    expect(JSON.parse(readFileSync(filePath, "utf8").trim())).toMatchObject({
      stage: "runner.skipped",
      level: "warn",
      source: "startup-auto",
      status: "skipped",
      reason: "db_cutover_in_progress",
    })
  })
})

describe("appendRefreshAuditTrace", () => {
  it("persists tracked batch diagnostics without sensitive refresh data", () => {
    const dir = mkdtempSync(join(tmpdir(), "suhui-refresh-trace-"))
    const filePath = join(dir, "refresh.log")
    const secretQuery = "query-token-secret"
    const secretTitle = "Confidential Feed Title"
    const secretConnection = "postgres://reader:password@localhost:5432/private"
    const secretSql = "SELECT content FROM entries WHERE token = 'sql-token-secret'"
    const secretPath = "/Users/private/Documents/feed.xml"
    const secretBody = "private article body"
    const secretError = "raw refresh failure detail"
    const feedUrl = `https://feeds.example/rss.xml?token=${secretQuery}`

    appendRefreshAuditTrace(
      {
        traceId: "trace-2",
        source: "startup-auto",
        mode: "batch",
        feedId: "feed_1",
        feedUrl,
      },
      "error",
      "batch.feed_failed",
      {
        targetFeedId: "feed_1",
        targetFeedUrl: feedUrl,
        statusCode: 503,
        title: secretTitle,
        connectionString: secretConnection,
        sql: secretSql,
        sqlParameters: ["sql-token-secret"],
        localPath: secretPath,
        content: secretBody,
        reason: secretError,
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
      status: "failed",
      feedId: "feed_1",
      feedUrl: "https://feeds.example/rss.xml",
      targetFeedId: "feed_1",
      targetFeedUrl: "https://feeds.example/rss.xml",
      statusCode: 503,
    })
    expect(entry).not.toHaveProperty("reason")
    expect(entry).not.toHaveProperty("title")
    expect(entry).not.toHaveProperty("connectionString")
    expect(entry).not.toHaveProperty("sql")
    expect(entry).not.toHaveProperty("sqlParameters")
    expect(entry).not.toHaveProperty("localPath")
    expect(entry).not.toHaveProperty("content")

    const serializedEntry = JSON.stringify(entry)
    for (const forbidden of [
      secretQuery,
      secretTitle,
      secretConnection,
      secretSql,
      secretPath,
      secretBody,
      secretError,
    ]) {
      expect(serializedEntry).not.toContain(forbidden)
    }
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
