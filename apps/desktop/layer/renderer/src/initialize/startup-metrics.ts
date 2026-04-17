import { appLog } from "~/lib/log"

export type StartupMetricName =
  | "shell_ready_ms"
  | "db_usable_ms"
  | "snapshot_restore_ms"
  | "interactive_ms"
  | "hydrate_critical_done_ms"
  | "ready_ms"

export type StartupSnapshotRestoreResult = "hit" | "miss" | "old_version" | "corrupt" | "skipped"

const startupMetrics = new Map<StartupMetricName, number>()
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

export const recordSnapshotRestoreResult = (result: StartupSnapshotRestoreResult) => {
  snapshotRestoreResults.push(result)
  appLog("[startup] snapshot_restore_result", result)
  return result
}

export const getStartupMetricsForTests = () => new Map(startupMetrics)
export const getSnapshotRestoreResultsForTests = () => [...snapshotRestoreResults]

export const resetStartupMetricsForTests = () => {
  startupMetrics.clear()
  snapshotRestoreResults.length = 0
}
