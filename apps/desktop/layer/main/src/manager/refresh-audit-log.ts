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

const refreshAuditUrlFields = new Set([
  "feedUrl",
  "requestedUrl",
  "resolvedUrl",
  "requestUrl",
  "location",
  "finalUrl",
  "parsedSiteUrl",
  "targetFeedUrl",
])

const refreshAuditIdFields = new Set([
  "traceId",
  "batchTraceId",
  "batchId",
  "feedId",
  "targetFeedId",
  "preferredFeedId",
  "previewFeedId",
  "ownerUserId",
])

const refreshAuditNumericFields = new Set([
  "total",
  "refreshed",
  "failed",
  "concurrency",
  "refresh_batch_event_count",
])

const safeRunnerSkipReasons = new Set(["db_cutover_in_progress", "previous_run_still_active"])

const trackedBatchStages = new Set([
  "batch.start",
  "batch.no_subscriptions",
  "batch.feed_failed",
  "batch.completed",
])

const isTrackedBatchSource = (source?: string): source is RefreshAuditSource =>
  source === "manual-batch" || source === "startup-auto" || source === "interval-auto"

const sanitizeRefreshAuditUrl = (value: unknown) => {
  if (typeof value !== "string") return

  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    return url.toString()
  } catch {
    return
  }
}

const deriveRefreshAuditStatus = (stage: string, level: RefreshAuditLevel) => {
  if (stage === "runner.skipped" || stage === "batch.no_subscriptions") return "skipped"
  if (
    level === "error" ||
    stage.includes("failed") ||
    stage.includes("failure") ||
    stage.includes("error") ||
    stage.includes("timeout") ||
    stage.includes("not_found")
  ) {
    return "failed"
  }
  if (stage.endsWith(".completed")) return "completed"
  if (stage.endsWith(".start")) return "started"
  if (level === "warn") return "warning"
}

const isRefreshAuditNumericField = (key: string) =>
  refreshAuditNumericFields.has(key) ||
  key.endsWith("Count") ||
  key.endsWith("Bytes") ||
  key.endsWith("Ms") ||
  key.endsWith("Code")

export const sanitizeRefreshAuditEvent = (event: RefreshAuditEvent): RefreshAuditEvent => {
  const sanitized: RefreshAuditEvent = {
    level: event.level,
    stage: event.stage,
  }

  for (const key of ["source", "mode"] as const) {
    const value = event[key]
    if (typeof value === "string" && value) sanitized[key] = value
  }

  for (const key of refreshAuditIdFields) {
    const value = event[key]
    if (typeof value === "string" && value) sanitized[key] = value
  }

  for (const key of refreshAuditUrlFields) {
    const value = sanitizeRefreshAuditUrl(event[key])
    if (value) sanitized[key] = value
  }

  for (const [key, value] of Object.entries(event)) {
    if (isRefreshAuditNumericField(key) && typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = value
    }
  }

  if (
    event.stage === "runner.skipped" &&
    typeof event.reason === "string" &&
    safeRunnerSkipReasons.has(event.reason)
  ) {
    sanitized.reason = event.reason
  }

  const status = deriveRefreshAuditStatus(event.stage, event.level)
  if (status) sanitized.status = status

  return sanitized
}

export const buildRefreshAuditEvent = (
  trace: RefreshTraceLike,
  level: RefreshAuditLevel,
  stage: string,
  extra: Record<string, unknown> = {},
) =>
  sanitizeRefreshAuditEvent({
    level,
    stage,
    source: trace.source,
    traceId: trace.traceId,
    batchTraceId: trace.batchTraceId,
    mode: trace.mode,
    feedId: trace.feedId,
    feedUrl: trace.feedUrl,
    ...extra,
  })

export const getRefreshAuditLogPath = () => join(app.getPath("logs"), "refresh.log")

export const appendRefreshAuditLog = (
  event: RefreshAuditEvent,
  filePath = getRefreshAuditLogPath(),
) => {
  const sanitizedEvent = sanitizeRefreshAuditEvent(event)
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    appendFileSync(
      filePath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        ...sanitizedEvent,
      })}\n`,
      "utf8",
    )
  } catch {
    // 审计日志不能反向阻断刷新主流程。
  }
  return sanitizedEvent
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
  const event = buildRefreshAuditEvent(trace, level, stage, extra)
  if (!shouldAppendRefreshAuditTrace(trace, stage)) return event

  appendRefreshAuditLog(event, filePath)
  return event
}
