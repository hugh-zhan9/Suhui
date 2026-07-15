export type FixtureScale = "normal" | "stress"

export type FixtureManifest = {
  version: 1
  seed: string
  scale: FixtureScale
  subscriptions: number
  entries: number
  viewDistribution: { articles: number; social: number; pictures: number; videos: number }
  privateRate: number
  hideFromTimelineRate: number
  readDistribution: { false: number; true: number; null: number }
  sharedPublishedAtMinimumRate: number
  bodyBytes: { p50: number; p95: number; max: number }
  includes: { media: true; attachments: true; sources: true }
}

export type PerformanceSurface =
  | "desktop-shell"
  | "desktop-db-to-interactive"
  | "desktop-feed-usable"
  | "desktop-unread-usable"
  | "remote-shell"
  | "remote-data-ready"

export const SAMPLE_METRIC_ORIGINS = {
  shell_ready_ms: ["desktop-feed-usable"],
  db_usable_ms: ["desktop-feed-usable"],
  interactive_ms: ["desktop-feed-usable"],
  db_usable_to_interactive_ms: ["desktop-feed-usable"],
  route_scope_ready_ms: ["desktop-feed-usable"],
  desktop_initial_entries_ready_ms: ["desktop-feed-usable"],
  desktop_startup_entry_rows: ["desktop-feed-usable"],
  desktop_feed_usable_ms: ["desktop-feed-usable"],
  desktop_unread_usable_ms: ["desktop-unread-usable"],
  entry_query_duration_ms: ["desktop-feed-usable", "remote-data-ready"],
  entry_query_rows: ["desktop-feed-usable", "remote-data-ready"],
  entry_fetch_to_store_ms: ["desktop-feed-usable", "remote-data-ready"],
  entry_list_payload_bytes: ["remote-data-ready"],
  remote_shell_visible_ms: ["remote-data-ready"],
  remote_bootstrap_ready_ms: ["remote-data-ready"],
  remote_initial_entries_ready_ms: ["remote-data-ready"],
  remote_data_ready_ms: ["remote-data-ready"],
  remote_bootstrap_error_visible_ms: ["remote-data-ready"],
  remote_entries_error_visible_ms: ["remote-data-ready"],
  injected_retry_final_success_ms: ["remote-data-ready"],
} as const satisfies Record<string, readonly PerformanceSurface[]>

export type SampleMetricName = keyof typeof SAMPLE_METRIC_ORIGINS
export type SampleMetrics = Partial<Record<SampleMetricName, number>>

export const selectSampleMetricsForSurface = (
  metrics: Readonly<Record<string, number>>,
  surface: PerformanceSurface,
): SampleMetrics =>
  Object.fromEntries(
    Object.entries(metrics).filter(
      ([name, value]) =>
        name in SAMPLE_METRIC_ORIGINS &&
        SAMPLE_METRIC_ORIGINS[name as SampleMetricName].includes(surface as never) &&
        Number.isFinite(value),
    ),
  )

export type PerformanceSample = {
  buildId: string
  runId: string
  fixture: FixtureScale
  temperature: "cold" | "warm"
  surface: PerformanceSurface
  success: boolean
  durationMs: number | null
  errorCode?: string
  metrics: SampleMetrics
}

export type BuildArtifactHash = {
  name: string
  sha256: string
  bytes: number
}

export type PerformanceBuildIdentity = {
  schema: "suhui.performance-build.v1"
  id: string
  headCommit: string
  dirty: boolean
  taskDiffSha256: string
  artifactHashes: BuildArtifactHash[]
  generatedAt: string
}

export type GateResult = {
  status: "pass" | "fail" | "unverified" | "stop_return_to_spec"
  failures: Array<{ group: string; observedP95: number; thresholdMs: number }>
  evidenceGaps: string[]
  databaseStopReason?: string
}

export type ArtifactInspection = {
  artifactRoot: string
  rsshubPaths: string[]
  requiredPaths: Record<string, boolean>
}
