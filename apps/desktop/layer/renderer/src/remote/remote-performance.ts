export type RemoteMetricName =
  | "remote_shell_visible_ms"
  | "remote_bootstrap_ready_ms"
  | "remote_initial_entries_ready_ms"
  | "remote_data_ready_ms"
  | "remote_bootstrap_error_visible_ms"
  | "remote_entries_error_visible_ms"

type RemotePerformanceSession = {
  id: string
  startedAt: number
  metrics: Map<RemoteMetricName, number>
}

let sessionSequence = 0
let session: RemotePerformanceSession | null = null

const createSessionId = () => {
  sessionSequence += 1
  return `remote-${Date.now().toString(36)}-${sessionSequence.toString(36)}`
}

export const beginRemotePerformanceSession = (startedAt = performance.now()): void => {
  session = {
    id: createSessionId(),
    startedAt,
    metrics: new Map(),
  }
}

const getSession = () => {
  if (!session) beginRemotePerformanceSession()
  return session!
}

export const markRemoteMetric = (name: RemoteMetricName, at = performance.now()): number => {
  const current = getSession()
  const existing = current.metrics.get(name)
  if (existing !== undefined) return existing

  const value = Math.max(0, Math.trunc(at - current.startedAt))
  current.metrics.set(name, value)
  console.info("[remote-performance]", { name, value, sessionId: current.id })
  return value
}

export const markRemoteDataReadyIfComplete = (input: {
  bootstrapReady: boolean
  initialEntriesReady: boolean
}): number | null => {
  if (!input.bootstrapReady || !input.initialEntriesReady) return null
  return markRemoteMetric("remote_data_ready_ms")
}
