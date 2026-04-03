import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

import { app } from "electron"
import { join } from "pathe"

type RefreshAuditLevel = "info" | "warn" | "error"

type RefreshAuditSource = "manual-batch" | "startup-auto" | "interval-auto"

type RefreshTraceLike = {
  traceId: string
  source: string
  mode: string
  feedId?: string
  feedUrl?: string
  batchTraceId?: string
}

type RefreshAuditEvent = {
  stage: string
  level: RefreshAuditLevel
  source?: string
  traceId?: string
  batchTraceId?: string
  mode?: string
  feedId?: string
  feedUrl?: string
} & Record<string, unknown>

const trackedBatchStages = new Set([
  "batch.start",
  "batch.no_subscriptions",
  "batch.feed_failed",
  "batch.completed",
])

const isTrackedBatchSource = (source?: string): source is RefreshAuditSource =>
  source === "manual-batch" || source === "startup-auto" || source === "interval-auto"

export const getRefreshAuditLogPath = () => join(app.getPath("logs"), "refresh.log")

export const appendRefreshAuditLog = (
  event: RefreshAuditEvent,
  filePath = getRefreshAuditLogPath(),
) => {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    appendFileSync(
      filePath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        ...event,
      })}\n`,
      "utf8",
    )
  } catch {
    // 审计日志不能反向阻断刷新主流程。
  }
}

export const shouldAppendRefreshAuditTrace = (trace: RefreshTraceLike, stage: string) =>
  trace.mode === "batch" && isTrackedBatchSource(trace.source) && trackedBatchStages.has(stage)

export const appendRefreshAuditTrace = (
  trace: RefreshTraceLike,
  level: RefreshAuditLevel,
  stage: string,
  extra: Record<string, unknown> = {},
  filePath?: string,
) => {
  if (!shouldAppendRefreshAuditTrace(trace, stage)) return

  appendRefreshAuditLog(
    {
      level,
      stage,
      source: trace.source,
      traceId: trace.traceId,
      batchTraceId: trace.batchTraceId,
      mode: trace.mode,
      feedId: trace.feedId,
      feedUrl: trace.feedUrl,
      ...extra,
    },
    filePath,
  )
}
