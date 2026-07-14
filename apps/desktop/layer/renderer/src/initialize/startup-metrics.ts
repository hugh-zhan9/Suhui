import { appLog } from "~/lib/log"

export type StartupMetricName =
  | "shell_ready_ms"
  | "db_usable_ms"
  | "snapshot_restore_ms"
  | "interactive_ms"
  | "route_scope_ready_ms"
  | "desktop_initial_entries_ready_ms"
  | "hydrate_critical_done_ms"
  | "ready_ms"

export type StartupCountMetricName = "desktop_startup_entry_rows"

export type StartupSnapshotRestoreResult = "hit" | "miss" | "old_version" | "corrupt" | "skipped"

const startupMetrics = new Map<StartupMetricName, number>()
const startupCountMetrics = new Map<StartupCountMetricName, number>()
const snapshotRestoreResults: StartupSnapshotRestoreResult[] = []

export const recordStartupMetric = (metric: StartupMetricName, value: number) => {
  if (startupMetrics.has(metric)) {
    return startupMetrics.get(metric)!
  }

  const normalizedValue = Math.trunc(value)
  startupMetrics.set(metric, normalizedValue)
  appLog(`[startup] ${metric}`, `${normalizedValue}ms`)
  return normalizedValue
}

export const markStartupMetric = (metric: Exclude<StartupMetricName, "snapshot_restore_ms">) => {
  return recordStartupMetric(metric, performance.now())
}

export const recordStartupCountMetric = (metric: StartupCountMetricName, value: number) => {
  if (startupCountMetrics.has(metric)) {
    return startupCountMetrics.get(metric)!
  }

  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new RangeError(`${metric} must be a finite non-negative integer`)
  }

  startupCountMetrics.set(metric, value)
  appLog(`[startup] ${metric}`, String(value))
  return value
}

export const recordSnapshotRestoreResult = (result: StartupSnapshotRestoreResult) => {
  snapshotRestoreResults.push(result)
  appLog("[startup] snapshot_restore_result", result)
  return result
}

export const getStartupMetricsForTests = () => new Map(startupMetrics)
export const getStartupCountMetricsForTests = () => new Map(startupCountMetrics)
export const getSnapshotRestoreResultsForTests = () => [...snapshotRestoreResults]

export const beginStartupMetricsSession = () => {
  startupMetrics.clear()
  startupCountMetrics.clear()
  snapshotRestoreResults.length = 0
}

export const resetStartupMetricsForTests = beginStartupMetricsSession
