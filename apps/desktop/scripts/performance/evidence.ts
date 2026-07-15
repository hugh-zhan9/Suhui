import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  SAMPLE_METRIC_ORIGINS,
  type PerformanceBuildIdentity,
  type PerformanceSample,
  type SampleMetricName,
} from "./contracts.ts"
import { FIXTURE_SEED } from "./fixture.ts"
import { nearestRank } from "./stats.ts"

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

export const REQUIRED_STABLE_METRICS = [
  "db_usable_to_interactive_ms",
  "route_scope_ready_ms",
  "desktop_initial_entries_ready_ms",
  "entry_query_duration_ms",
  "entry_query_rows",
  "entry_list_payload_bytes",
  "desktop_startup_entry_rows",
  "refresh_batch_event_count",
  "refresh_renderer_refetch_count",
  "remote_shell_visible_ms",
  "remote_bootstrap_ready_ms",
  "remote_initial_entries_ready_ms",
  "remote_bootstrap_error_visible_ms",
  "remote_entries_error_visible_ms",
] as const

export type StableMetricName = (typeof REQUIRED_STABLE_METRICS)[number]

export const STABLE_METRIC_ORIGINS = {
  db_usable_to_interactive_ms: { source: "sample", surfaces: ["desktop-feed-usable"] },
  route_scope_ready_ms: { source: "sample", surfaces: ["desktop-feed-usable"] },
  desktop_initial_entries_ready_ms: { source: "sample", surfaces: ["desktop-feed-usable"] },
  entry_query_duration_ms: {
    source: "sample",
    surfaces: ["desktop-feed-usable", "remote-data-ready"],
  },
  entry_query_rows: {
    source: "sample",
    surfaces: ["desktop-feed-usable", "remote-data-ready"],
  },
  entry_list_payload_bytes: { source: "sample", surfaces: ["remote-data-ready"] },
  desktop_startup_entry_rows: { source: "sample", surfaces: ["desktop-feed-usable"] },
  refresh_batch_event_count: { source: "refresh", surfaces: [] },
  refresh_renderer_refetch_count: { source: "refresh", surfaces: [] },
  remote_shell_visible_ms: { source: "sample", surfaces: ["remote-data-ready"] },
  remote_bootstrap_ready_ms: { source: "sample", surfaces: ["remote-data-ready"] },
  remote_initial_entries_ready_ms: { source: "sample", surfaces: ["remote-data-ready"] },
  remote_bootstrap_error_visible_ms: { source: "sample", surfaces: ["remote-data-ready"] },
  remote_entries_error_visible_ms: { source: "sample", surfaces: ["remote-data-ready"] },
} as const satisfies Record<
  StableMetricName,
  { source: "sample" | "refresh"; surfaces: readonly string[] }
>

export type RefreshEvidenceRow = {
  feedCount: 1 | 10 | 50
  refresh_batch_event_count: number
  refresh_renderer_refetch_count: number
  total_entry_query_reloads: number
}

export type RefreshEvidence = {
  schema: "suhui.performance-refresh.v1"
  buildId: string
  collectorSha256: string
  records: RefreshEvidenceRow[]
}

type MetricSummary = { count: number; p50: number; p95: number; max: number }
type InitialAsset = { name: string; bytes: number; sha256: string }

type PriorEvidence = {
  schema: "suhui.performance-prior-evidence.v1"
  ownerPlanCommit: string
  bundle: {
    sourceLabel: string
    desktopInitialRequests: number
    remoteInitialRequests: number
    desktopInitialJsBytes: number
    remoteInitialJsBytes: number
    sharedInitialJsBytes: number
    sharedInitialCssBytes: number
  }
  sidebar: {
    sourceLabel: string
    subscriptions400: {
      domNodes: number
      initialDurationMs: number
      unrelatedRenders: number
      selectedRenders: number
    }
    subscriptions800: {
      domNodes: number
      initialDurationMs: number
      unrelatedRenders: number
      selectedRenders: number
    }
    virtualization: "not_entered"
  }
}

export type OperationalEvidence = {
  schema: "suhui.performance-evidence.v1"
  buildId: string
  seed: string
  sourceHashes: {
    desktopRunnerSha256: string
    remoteRunnerSha256: string
    collectorSha256: string
    priorEvidenceSha256: string
  }
  lifecycle: {
    desktopCold: "clear-marked-profile-before-each-full-restart"
    desktopWarm: "prime-once-exit-then-full-cache-preserving-restarts"
    remoteCold: "fresh-context-cache-disabled-on-measured-page"
    remoteWarm: "retained-preheated-context-fresh-measured-pages"
  }
  refresh: RefreshEvidence
  payload: MetricSummary
  initialAssets: { desktop: InitialAsset[]; remote: InitialAsset[] }
  priorBundle: {
    ownerPlanCommit: string
    sourceLabel: string
    desktopInitialRequests: number
    remoteInitialRequests: number
    desktopInitialJsBytes: number
    remoteInitialJsBytes: number
    sharedInitialJsBytes: number
    sharedInitialCssBytes: number
  }
  sidebar: {
    ownerPlanCommit: string
    sourceLabel: string
    subscriptions400: {
      domNodes: number
      initialDurationMs: number
      unrelatedRenders: number
      selectedRenders: number
    }
    subscriptions800: {
      domNodes: number
      initialDurationMs: number
      unrelatedRenders: number
      selectedRenders: number
    }
    virtualization: "not_entered"
  }
  failureEvidence: Array<{
    errorCode: string
    remote_shell_visible_ms: number
    errorVisibleMetric: "remote_bootstrap_error_visible_ms" | "remote_entries_error_visible_ms"
    errorVisibleMs: number
    retryFinalSuccessMs: number
  }>
  stableMetrics: Record<StableMetricName, MetricSummary>
}

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")

const summarize = (values: readonly number[]): MetricSummary => {
  if (values.length === 0) throw new Error("metric evidence is empty")
  return {
    count: values.length,
    p50: nearestRank(values, 0.5),
    p95: nearestRank(values, 0.95),
    max: Math.max(...values),
  }
}

const assertExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) => {
  const allowed = new Set([...required, ...optional])
  const extra = Object.keys(value).filter((key) => !allowed.has(key))
  const missing = required.filter((key) => !(key in value))
  if (extra.length > 0 || missing.length > 0) {
    throw new Error(
      `closed schema mismatch; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`,
    )
  }
}

export function assertPerformanceSample(value: unknown): asserts value is PerformanceSample {
  if (!value || typeof value !== "object") throw new Error("sample must be an object")
  if (Array.isArray(value)) throw new Error("sample must not be an array")
  assertExactKeys(
    value as Record<string, unknown>,
    ["buildId", "runId", "fixture", "temperature", "surface", "success", "durationMs", "metrics"],
    ["errorCode"],
  )
  const sample = value as Partial<PerformanceSample>
  if (
    typeof sample.buildId !== "string" ||
    !/^[a-f0-9]{64}$/.test(sample.buildId) ||
    typeof sample.runId !== "string" ||
    !["normal", "stress"].includes(sample.fixture ?? "") ||
    !["cold", "warm"].includes(sample.temperature ?? "") ||
    ![
      "desktop-shell",
      "desktop-db-to-interactive",
      "desktop-feed-usable",
      "desktop-unread-usable",
      "remote-shell",
      "remote-data-ready",
    ].includes(sample.surface ?? "") ||
    typeof sample.success !== "boolean" ||
    (sample.durationMs !== null &&
      (typeof sample.durationMs !== "number" || !Number.isFinite(sample.durationMs))) ||
    !sample.metrics ||
    typeof sample.metrics !== "object" ||
    Array.isArray(sample.metrics) ||
    (sample.errorCode !== undefined && typeof sample.errorCode !== "string")
  ) {
    throw new Error("invalid performance sample")
  }
  if (sample.success && (sample.durationMs === null || sample.errorCode)) {
    throw new Error("successful sample cannot contain an error or null duration")
  }
  if (!sample.success && (sample.durationMs !== null || !sample.errorCode)) {
    throw new Error("failed sample requires a null duration and error code")
  }
  for (const [name, metric] of Object.entries(sample.metrics)) {
    if (
      !(name in SAMPLE_METRIC_ORIGINS) ||
      !SAMPLE_METRIC_ORIGINS[name as SampleMetricName].includes(sample.surface as never) ||
      typeof metric !== "number" ||
      !Number.isFinite(metric)
    ) {
      throw new Error("invalid sample metric")
    }
  }
}

export function assertPerformanceSampleSet(
  samples: readonly unknown[],
): asserts samples is readonly PerformanceSample[] {
  const records = new Set<string>()
  const runMetadata = new Map<string, string>()
  const metricRuns = new Set<string>()
  for (const value of samples) {
    assertPerformanceSample(value)
    const recordKey = `${value.runId}\0${value.surface}`
    if (records.has(recordKey)) throw new Error(`duplicate run/surface record: ${value.runId}`)
    records.add(recordKey)

    const metadata = `${value.buildId}\0${value.fixture}\0${value.temperature}`
    const existing = runMetadata.get(value.runId)
    if (existing && existing !== metadata)
      throw new Error(`conflicting run metadata: ${value.runId}`)
    runMetadata.set(value.runId, metadata)

    for (const metric of Object.keys(value.metrics)) {
      const metricRunKey = `${metric}\0${value.runId}`
      if (metricRuns.has(metricRunKey)) {
        throw new Error(`duplicate metric observation for run: ${metric}/${value.runId}`)
      }
      metricRuns.add(metricRunKey)
    }
  }
}

export function assertRefreshEvidence(
  value: unknown,
  expectedBuildId?: string,
): asserts value is RefreshEvidence {
  if (!value || typeof value !== "object") throw new Error("refresh evidence must be an object")
  if (Array.isArray(value)) throw new Error("refresh evidence must not be an array")
  assertExactKeys(value as Record<string, unknown>, [
    "schema",
    "buildId",
    "collectorSha256",
    "records",
  ])
  const evidence = value as Partial<RefreshEvidence>
  if (
    evidence.schema !== "suhui.performance-refresh.v1" ||
    typeof evidence.buildId !== "string" ||
    (expectedBuildId && evidence.buildId !== expectedBuildId) ||
    !/^[a-f0-9]{64}$/.test(evidence.collectorSha256 ?? "") ||
    !Array.isArray(evidence.records) ||
    evidence.records.length !== 3
  ) {
    throw new Error("invalid refresh evidence envelope")
  }
  for (const feedCount of [1, 10, 50] as const) {
    const record = evidence.records.find((candidate) => candidate.feedCount === feedCount)
    if (record) {
      assertExactKeys(record as unknown as Record<string, unknown>, [
        "feedCount",
        "refresh_batch_event_count",
        "refresh_renderer_refetch_count",
        "total_entry_query_reloads",
      ])
    }
    if (
      !record ||
      record.refresh_batch_event_count !== 1 ||
      record.refresh_renderer_refetch_count < 0 ||
      record.refresh_renderer_refetch_count > 1 ||
      record.total_entry_query_reloads < 0 ||
      record.total_entry_query_reloads > feedCount
    ) {
      throw new Error(`invalid refresh evidence for ${feedCount} feeds`)
    }
  }
}

const collectInitialAssets = async (htmlName: "index.html" | "remote.html") => {
  const html = await readFile(resolve(appRoot, "dist/renderer", htmlName), "utf8")
  const names = [...html.matchAll(/(?:src|href)="(?:\.\/|\/)(assets\/[^"?#]+)"/g)].map(
    (match) => match[1]!,
  )
  if (names.length === 0) throw new Error(`${htmlName} contains no initial assets`)
  return Promise.all(
    [...new Set(names)].map(async (name) => {
      const absolute = resolve(appRoot, "dist/renderer", name)
      const [content, metadata] = await Promise.all([readFile(absolute), stat(absolute)])
      return { name, bytes: metadata.size, sha256: sha256(content) }
    }),
  )
}

function assertPriorEvidence(value: unknown): asserts value is PriorEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("prior evidence must be an object")
  }
  const input = value as Partial<PriorEvidence>
  assertExactKeys(value as Record<string, unknown>, [
    "schema",
    "ownerPlanCommit",
    "bundle",
    "sidebar",
  ])
  if (
    input.schema !== "suhui.performance-prior-evidence.v1" ||
    !/^[a-f0-9]{40}$/.test(input.ownerPlanCommit ?? "") ||
    !input.bundle ||
    !input.sidebar
  ) {
    throw new Error("invalid prior evidence envelope")
  }
  assertExactKeys(input.bundle as unknown as Record<string, unknown>, [
    "sourceLabel",
    "desktopInitialRequests",
    "remoteInitialRequests",
    "desktopInitialJsBytes",
    "remoteInitialJsBytes",
    "sharedInitialJsBytes",
    "sharedInitialCssBytes",
  ])
  assertExactKeys(input.sidebar as unknown as Record<string, unknown>, [
    "sourceLabel",
    "subscriptions400",
    "subscriptions800",
    "virtualization",
  ])
  const numeric = [
    input.bundle.desktopInitialRequests,
    input.bundle.remoteInitialRequests,
    input.bundle.desktopInitialJsBytes,
    input.bundle.remoteInitialJsBytes,
    input.bundle.sharedInitialJsBytes,
    input.bundle.sharedInitialCssBytes,
    ...Object.values(input.sidebar.subscriptions400),
    ...Object.values(input.sidebar.subscriptions800),
  ]
  if (
    typeof input.bundle.sourceLabel !== "string" ||
    typeof input.sidebar.sourceLabel !== "string" ||
    input.sidebar.virtualization !== "not_entered" ||
    numeric.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error("invalid prior evidence values")
  }
}

export async function collectOperationalEvidence(input: {
  buildIdentity: PerformanceBuildIdentity
  samples: readonly PerformanceSample[]
  refresh: RefreshEvidence
}): Promise<OperationalEvidence> {
  assertPerformanceSampleSet(input.samples)
  if (input.samples.some((sample) => sample.buildId !== input.buildIdentity.id)) {
    throw new Error("raw samples contain a mixed build identity")
  }
  assertRefreshEvidence(input.refresh, input.buildIdentity.id)

  const desktopRunner = await readFile(resolve(appRoot, "scripts/performance/run-desktop.ts"))
  const remoteRunner = await readFile(resolve(appRoot, "scripts/performance/run-remote.ts"))
  const collector = await readFile(resolve(appRoot, "scripts/performance/evidence.ts"))
  const priorSerialized = await readFile(
    resolve(appRoot, "scripts/performance/prior-evidence.v1.json"),
    "utf8",
  )
  const prior = JSON.parse(priorSerialized) as unknown
  assertPriorEvidence(prior)
  if (input.refresh.collectorSha256 !== sha256(desktopRunner)) {
    throw new Error("refresh evidence collector source hash is stale")
  }

  const metricValues = Object.fromEntries(
    REQUIRED_STABLE_METRICS.map((metric) => [metric, new Map<string, number>()]),
  ) as Record<StableMetricName, Map<string, number>>
  for (const sample of input.samples) {
    for (const metric of REQUIRED_STABLE_METRICS) {
      const origin = STABLE_METRIC_ORIGINS[metric]
      const value =
        origin.source === "sample" ? sample.metrics[metric as SampleMetricName] : undefined
      if (value !== undefined) {
        if (origin.source !== "sample" || !origin.surfaces.includes(sample.surface as never)) {
          throw new Error(`disallowed stable metric origin: ${metric}/${sample.surface}`)
        }
        metricValues[metric].set(sample.runId, value)
      }
    }
  }
  for (const record of input.refresh.records) {
    metricValues.refresh_batch_event_count.set(
      `refresh-${record.feedCount}`,
      record.refresh_batch_event_count,
    )
    metricValues.refresh_renderer_refetch_count.set(
      `refresh-${record.feedCount}`,
      record.refresh_renderer_refetch_count,
    )
  }

  const failureEvidence = input.samples
    .filter((sample) => !sample.success && sample.errorCode?.startsWith("INJECTED_REMOTE_"))
    .map((sample) => {
      const errorVisibleMetric: OperationalEvidence["failureEvidence"][number]["errorVisibleMetric"] =
        sample.errorCode?.includes("BOOTSTRAP")
          ? "remote_bootstrap_error_visible_ms"
          : "remote_entries_error_visible_ms"
      const errorVisibleMs = sample.metrics[errorVisibleMetric]
      const retryFinalSuccessMs = sample.metrics.injected_retry_final_success_ms
      const shell = sample.metrics.remote_shell_visible_ms
      if ([errorVisibleMs, retryFinalSuccessMs, shell].some((value) => value === undefined)) {
        throw new Error("injected failure evidence is incomplete")
      }
      return {
        errorCode: sample.errorCode!,
        remote_shell_visible_ms: shell!,
        errorVisibleMetric,
        errorVisibleMs: errorVisibleMs!,
        retryFinalSuccessMs: retryFinalSuccessMs!,
      }
    })
  if (new Set(failureEvidence.map((record) => record.errorVisibleMetric)).size !== 2) {
    throw new Error("both Remote failure scenarios are required")
  }

  const stableMetrics = Object.fromEntries(
    REQUIRED_STABLE_METRICS.map((metric) => [
      metric,
      summarize([...metricValues[metric].values()]),
    ]),
  ) as Record<StableMetricName, MetricSummary>

  return {
    schema: "suhui.performance-evidence.v1",
    buildId: input.buildIdentity.id,
    seed: FIXTURE_SEED,
    sourceHashes: {
      desktopRunnerSha256: sha256(desktopRunner),
      remoteRunnerSha256: sha256(remoteRunner),
      collectorSha256: sha256(collector),
      priorEvidenceSha256: sha256(priorSerialized),
    },
    lifecycle: {
      desktopCold: "clear-marked-profile-before-each-full-restart",
      desktopWarm: "prime-once-exit-then-full-cache-preserving-restarts",
      remoteCold: "fresh-context-cache-disabled-on-measured-page",
      remoteWarm: "retained-preheated-context-fresh-measured-pages",
    },
    refresh: input.refresh,
    payload: stableMetrics.entry_list_payload_bytes,
    initialAssets: {
      desktop: await collectInitialAssets("index.html"),
      remote: await collectInitialAssets("remote.html"),
    },
    priorBundle: {
      ownerPlanCommit: prior.ownerPlanCommit,
      ...prior.bundle,
    },
    sidebar: {
      ownerPlanCommit: prior.ownerPlanCommit,
      ...prior.sidebar,
    },
    failureEvidence,
    stableMetrics,
  }
}

export function assertOperationalEvidence(
  value: unknown,
  expectedBuildId?: string,
): asserts value is OperationalEvidence {
  if (!value || typeof value !== "object") throw new Error("operational evidence must be an object")
  const evidence = value as Partial<OperationalEvidence>
  if (
    evidence.schema !== "suhui.performance-evidence.v1" ||
    typeof evidence.buildId !== "string" ||
    (expectedBuildId && evidence.buildId !== expectedBuildId) ||
    evidence.seed !== FIXTURE_SEED ||
    !evidence.sourceHashes ||
    Object.values(evidence.sourceHashes).some((hash) => !/^[a-f0-9]{64}$/.test(hash)) ||
    !evidence.lifecycle ||
    !evidence.refresh ||
    !evidence.payload ||
    !evidence.initialAssets ||
    !evidence.priorBundle ||
    !evidence.sidebar ||
    !Array.isArray(evidence.failureEvidence) ||
    !evidence.stableMetrics
  ) {
    throw new Error("invalid operational evidence envelope")
  }
  assertRefreshEvidence(evidence.refresh, evidence.buildId)
  for (const metric of REQUIRED_STABLE_METRICS) {
    const summary = evidence.stableMetrics[metric]
    if (
      !summary ||
      summary.count < 1 ||
      ![summary.p50, summary.p95, summary.max].every(Number.isFinite)
    ) {
      throw new Error(`invalid stable metric evidence: ${metric}`)
    }
  }
  if (evidence.failureEvidence.length < 2) throw new Error("Remote failure evidence is incomplete")
}
