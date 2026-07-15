#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { arch, cpus, platform, release } from "node:os"
import { pathToFileURL } from "node:url"

import { dirname, resolve } from "pathe"

import { assertBuildIdentity } from "./build-identity.ts"
import type {
  FixtureScale,
  GateResult,
  PerformanceBuildIdentity,
  PerformanceSample,
  PerformanceSurface,
} from "./contracts.ts"
import type { OperationalEvidence } from "./evidence.ts"
import {
  assertOperationalEvidence,
  assertPerformanceSampleSet,
  REQUIRED_STABLE_METRICS,
} from "./evidence.ts"
import type { QueryPlanArtifact } from "./query-plan.ts"
import { assertQueryPlanArtifact, loadCurrentQueryPlanProvenance } from "./query-plan.ts"
import { summarizeSuccessfulSamples } from "./stats.ts"

export { REQUIRED_STABLE_METRICS } from "./evidence.ts"

const thresholds: Record<PerformanceSurface, number> = {
  "desktop-shell": 1_200,
  "desktop-db-to-interactive": 500,
  "desktop-feed-usable": 300,
  "desktop-unread-usable": 300,
  "remote-shell": 800,
  "remote-data-ready": 1_500,
}

const defaultFixtures: FixtureScale[] = ["normal", "stress"]
const defaultTemperatures = ["cold", "warm"] as const
const defaultSurfaces = Object.keys(thresholds) as PerformanceSurface[]

export const thresholdForSurface = (surface: PerformanceSurface) => thresholds[surface]

type EvaluationSelection = {
  fixtures?: readonly FixtureScale[]
  temperatures?: readonly ("cold" | "warm")[]
  surfaces?: readonly PerformanceSurface[]
}

export type PerformanceGroupReport = {
  key: string
  fixture: FixtureScale
  temperature: "cold" | "warm"
  surface: PerformanceSurface
  thresholdMs: number
  successfulSamples: number
  failedSamples: number
  status: "pass" | "fail" | "unverified"
  p50: number | null
  p95: number | null
  max: number | null
  evidenceGap?: string
}

export type PerformanceEvaluation = {
  gate: GateResult
  groups: PerformanceGroupReport[]
}

export type D014Decision = {
  requiresPersistentDatabaseChange: boolean
  basis: string
}

export function applyQueryPlanDecision(
  gate: GateResult,
  artifacts: readonly QueryPlanArtifact[],
  decision: D014Decision,
  inputEvidenceGaps: readonly string[] = [],
): GateResult {
  const evidenceGaps = [...gate.evidenceGaps, ...inputEvidenceGaps]
  for (const fixture of defaultFixtures) {
    const matching = artifacts.filter((artifact) => artifact.fixture === fixture)
    if (matching.length !== 1) {
      evidenceGaps.push(`${fixture} EXPLAIN evidence is missing or duplicated`)
      continue
    }
    const artifact = matching[0]!
    try {
      assertQueryPlanArtifact(artifact)
    } catch (error) {
      evidenceGaps.push(
        `${fixture} EXPLAIN evidence is invalid: ${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }
    if (artifact.status !== "ready") {
      evidenceGaps.push(
        ...artifact.evidenceGaps.map((gap) => `${fixture} EXPLAIN evidence: ${gap}`),
      )
    }
  }

  if (evidenceGaps.length > 0) {
    return { ...gate, status: "unverified", evidenceGaps }
  }
  if (decision.requiresPersistentDatabaseChange) {
    return {
      ...gate,
      status: "stop_return_to_spec",
      databaseStopReason: decision.basis,
    }
  }
  return gate
}

export function deriveD014Decision(artifacts: readonly QueryPlanArtifact[]): D014Decision {
  artifacts.forEach(assertQueryPlanArtifact)
  const executionTimes = artifacts.flatMap((artifact) =>
    artifact.statements.map((statement) => statement.plan.executionMs),
  )
  if (executionTimes.length !== 8 || executionTimes.some((value) => !Number.isFinite(value))) {
    throw new Error("D-014 decision requires eight completed representative EXPLAIN plans")
  }
  const maxExecutionMs = Math.max(...executionTimes)
  if (maxExecutionMs > thresholds["desktop-feed-usable"]) {
    return {
      requiresPersistentDatabaseChange: true,
      basis: `maximum representative EXPLAIN execution ${maxExecutionMs}ms exceeds the 300ms usable-list budget; persistent database change requires architecture review`,
    }
  }
  return {
    requiresPersistentDatabaseChange: false,
    basis: `maximum representative EXPLAIN execution ${maxExecutionMs}ms is below the 300ms usable-list budget; the retained P95 breaches therefore do not prove that an index or schema change is necessary`,
  }
}

const groupKey = (
  fixture: FixtureScale,
  temperature: "cold" | "warm",
  surface: PerformanceSurface,
) => `${fixture}/${temperature}/${surface}`

export function evaluatePerformanceSamples(
  samples: readonly PerformanceSample[],
  selection: EvaluationSelection = {},
): PerformanceEvaluation {
  const fixtures = selection.fixtures ?? defaultFixtures
  const temperatures = selection.temperatures ?? defaultTemperatures
  const surfaces = selection.surfaces ?? defaultSurfaces
  const groups: PerformanceGroupReport[] = []
  const failures: GateResult["failures"] = []
  const evidenceGaps: string[] = []

  for (const fixture of fixtures) {
    for (const temperature of temperatures) {
      for (const surface of surfaces) {
        const key = groupKey(fixture, temperature, surface)
        const selected = samples.filter(
          (sample) =>
            sample.fixture === fixture &&
            sample.temperature === temperature &&
            sample.surface === surface,
        )
        const successfulSamples = selected.filter(
          (sample) =>
            sample.success &&
            !sample.errorCode &&
            sample.durationMs !== null &&
            Number.isFinite(sample.durationMs) &&
            sample.durationMs >= 0,
        ).length
        const failedSamples = selected.length - successfulSamples
        const thresholdMs = thresholdForSurface(surface)

        try {
          const summary = summarizeSuccessfulSamples(
            selected.map((sample) =>
              sample.success && (sample.errorCode || sample.durationMs === null)
                ? { ...sample, success: false }
                : sample,
            ),
          )
          const status = summary.p95 <= thresholdMs ? "pass" : "fail"
          groups.push({
            key,
            fixture,
            temperature,
            surface,
            thresholdMs,
            successfulSamples,
            failedSamples,
            status,
            p50: summary.p50,
            p95: summary.p95,
            max: summary.max,
          })
          if (status === "fail") {
            failures.push({ group: key, observedP95: summary.p95, thresholdMs })
          }
        } catch (error) {
          const evidenceGap = `${key}: ${error instanceof Error ? error.message : String(error)}`
          evidenceGaps.push(evidenceGap)
          groups.push({
            key,
            fixture,
            temperature,
            surface,
            thresholdMs,
            successfulSamples,
            failedSamples,
            status: "unverified",
            p50: null,
            p95: null,
            max: null,
            evidenceGap,
          })
        }
      }
    }
  }

  return {
    groups,
    gate: {
      status: evidenceGaps.length > 0 ? "unverified" : failures.length > 0 ? "fail" : "pass",
      failures,
      evidenceGaps,
    },
  }
}

const sensitiveKeyPattern =
  /(?:^|_)(?:content|body|title|url|query|sql|params?|connection|string|password|secret|token|path)(?:$|_)/i
const sensitiveArtifactValuePattern =
  /postgres(?:ql)?:\/\/|DB_PASSWORD|\/(?:Users|home|tmp|private\/tmp|var\/folders)\/[^"\s]+|[A-Z]:\\+(?:Users|Temp)\\[^"\r\n]+|https?:\/\/[^"\s]+\?[^"\s]*/i
const allowedQueryMetricKeys = new Set([
  "entry_query_duration_ms",
  "entry_query_rows",
  "total_entry_query_reloads",
])
const sensitiveNormalizedKeyParts = [
  "title",
  "body",
  "content",
  "url",
  "query",
  "path",
  "connection",
  "secret",
  "password",
  "token",
  "param",
] as const

export function sanitizeMetricRecord(input: Record<string, number>): Record<string, number> {
  const output: Record<string, number> = {}
  for (const [key, value] of Object.entries(input)) {
    if (
      sensitiveKeyPattern.test(key) &&
      !REQUIRED_STABLE_METRICS.includes(key as (typeof REQUIRED_STABLE_METRICS)[number])
    ) {
      throw new Error(`sensitive metric key: ${key}`)
    }
    if (!Number.isFinite(value)) throw new Error(`${key} must be a finite number`)
    output[key] = value
  }
  return output
}

export function assertArtifactIsSanitized(serialized: string): void {
  if (sensitiveArtifactValuePattern.test(serialized)) {
    throw new Error("sensitive performance artifact content detected")
  }
  let values: unknown[]
  try {
    values = [JSON.parse(serialized) as unknown]
  } catch {
    try {
      values = serialized
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown)
    } catch {
      throw new Error("performance artifact is not valid JSON or JSONL")
    }
  }
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== "object") return
    for (const [key, nested] of Object.entries(value)) {
      const normalized = key.replaceAll(/[_-]/g, "").toLowerCase()
      if (
        !allowedQueryMetricKeys.has(key) &&
        sensitiveNormalizedKeyParts.some((part) => normalized.includes(part))
      ) {
        throw new Error(`sensitive performance artifact key: ${key}`)
      }
      visit(nested)
    }
  }
  values.forEach(visit)
}

export function assertRequiredStableMetrics(metrics: readonly string[]): void {
  const provided = new Set(metrics)
  const missing = REQUIRED_STABLE_METRICS.filter((metric) => !provided.has(metric))
  if (missing.length > 0) throw new Error(`missing stable metrics: ${missing.join(", ")}`)
}

export type AuditablePerformanceReport = PerformanceEvaluation & {
  metadata: {
    machine: string
    os: string
    arch: string
    buildIdentity: PerformanceBuildIdentity
    buildMode: "production"
    seed: string
    generatedAt: string
  }
  samples: PerformanceSample[]
  metricsPresent: string[]
  evidence: OperationalEvidence
  databaseEvidence?: {
    artifacts: QueryPlanArtifact[]
    decision: D014Decision
    evidenceGaps: string[]
  }
}

export function createAuditableReport(
  samples: readonly PerformanceSample[],
  evidence: OperationalEvidence,
  buildIdentity: PerformanceBuildIdentity,
  databaseEvidence?: AuditablePerformanceReport["databaseEvidence"],
): AuditablePerformanceReport {
  assertPerformanceSampleSet(samples)
  assertBuildIdentity(buildIdentity)
  assertOperationalEvidence(evidence, buildIdentity.id)
  if (samples.some((sample) => sample.buildId !== buildIdentity.id)) {
    throw new Error("samples and report build identity differ")
  }
  const evaluation = evaluatePerformanceSamples(samples)
  const metrics = new Set(samples.flatMap((sample) => Object.keys(sample.metrics)))
  for (const metric of REQUIRED_STABLE_METRICS) {
    if (evidence.stableMetrics[metric]?.count > 0) metrics.add(metric)
  }
  const metricsPresent = Array.from(metrics).sort()
  const missingMetrics = REQUIRED_STABLE_METRICS.filter((metric) => !metrics.has(metric))
  const performanceGate =
    missingMetrics.length === 0
      ? evaluation.gate
      : {
          ...evaluation.gate,
          status: "unverified" as const,
          evidenceGaps: [
            ...evaluation.gate.evidenceGaps,
            `missing stable metrics: ${missingMetrics.join(", ")}`,
          ],
        }
  const gate = databaseEvidence
    ? applyQueryPlanDecision(
        performanceGate,
        databaseEvidence.artifacts,
        databaseEvidence.decision,
        databaseEvidence.evidenceGaps,
      )
    : performanceGate
  return {
    ...evaluation,
    gate,
    metadata: {
      machine: cpus()[0]?.model ?? "unknown",
      os: `${platform()} ${release()}`,
      arch: arch(),
      buildIdentity,
      buildMode: "production",
      seed: evidence.seed,
      generatedAt: new Date().toISOString(),
    },
    samples: samples.map((sample) => ({
      ...sample,
      metrics: sanitizeMetricRecord(sample.metrics),
    })),
    metricsPresent,
    evidence,
    ...(databaseEvidence ? { databaseEvidence } : {}),
  }
}

const markdown = (report: AuditablePerformanceReport) => {
  const rows = report.groups
    .map(
      (group) =>
        `| ${group.key} | ${group.successfulSamples} | ${group.failedSamples} | ${group.p50 ?? "-"} | ${group.p95 ?? "-"} | ${group.max ?? "-"} | ${group.thresholdMs} | ${group.status} |`,
    )
    .join("\n")
  return `# Suhui Production Performance Report

- Verdict: **${report.gate.status}**
- Commit: \`${report.metadata.buildIdentity.headCommit}\`
- Dirty build: \`${report.metadata.buildIdentity.dirty}\`
- Build identity: \`${report.metadata.buildIdentity.id}\`
- Build: \`${report.metadata.buildMode}\`
- Fixture seed: \`${report.metadata.seed}\`
- Machine: ${report.metadata.machine}; ${report.metadata.os}; ${report.metadata.arch}
- Generated: ${report.metadata.generatedAt}
${report.databaseEvidence ? `- D-014: ${report.databaseEvidence.decision.basis}` : ""}
${report.gate.databaseStopReason ? `- Database stop: ${report.gate.databaseStopReason}` : ""}

| Group | Success | Failure | P50 | P95 | Max | Threshold | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows}

## Evidence Gaps

${report.gate.evidenceGaps.length > 0 ? report.gate.evidenceGaps.map((gap) => `- ${gap}`).join("\n") : "None."}

## Threshold Failures

${report.gate.failures.length > 0 ? report.gate.failures.map((failure) => `- ${failure.group}: P95 ${failure.observedP95}ms > ${failure.thresholdMs}ms`).join("\n") : "None."}
`
}

export async function writeAuditableReport(input: {
  samples: readonly PerformanceSample[]
  evidence: OperationalEvidence
  buildIdentity: PerformanceBuildIdentity
  jsonPath: string
  markdownPath: string
  databaseEvidence?: AuditablePerformanceReport["databaseEvidence"]
}): Promise<AuditablePerformanceReport> {
  const report = createAuditableReport(
    input.samples,
    input.evidence,
    input.buildIdentity,
    input.databaseEvidence,
  )
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  assertArtifactIsSanitized(serialized)
  await Promise.all([
    mkdir(dirname(resolve(input.jsonPath)), { recursive: true }),
    mkdir(dirname(resolve(input.markdownPath)), { recursive: true }),
  ])
  await Promise.all([
    writeFile(input.jsonPath, serialized),
    writeFile(input.markdownPath, markdown(report)),
  ])
  return report
}

const parseCli = (argv: readonly string[]) => {
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index !== -1 ? argv[index + 1] : undefined
  }
  return {
    raw: value("--raw") ?? "out/performance/raw-samples.jsonl",
    json: value("--json") ?? "out/performance/report.json",
    markdown: value("--markdown") ?? "out/performance/report.md",
    evidence: value("--evidence") ?? "out/performance/operational-evidence.json",
    buildIdentity: value("--build-identity") ?? "out/performance/build-identity.json",
    normalPlan: value("--normal-plan") ?? "out/performance/query-plans/normal.json",
    stressPlan: value("--stress-plan") ?? "out/performance/query-plans/stress.json",
  }
}

const loadQueryPlan = async (
  fixture: FixtureScale,
  file: string,
  currentProvenance: QueryPlanArtifact["provenance"],
): Promise<{ artifact?: QueryPlanArtifact; evidenceGap?: string }> => {
  let serialized: string
  try {
    serialized = await readFile(file, "utf8")
  } catch {
    return { evidenceGap: `${fixture} EXPLAIN evidence is missing` }
  }
  let artifact: unknown
  try {
    artifact = JSON.parse(serialized) as unknown
  } catch {
    return { evidenceGap: `${fixture} EXPLAIN evidence is malformed` }
  }
  try {
    assertQueryPlanArtifact(artifact)
    if (artifact.fixture !== fixture) {
      throw new Error("fixture mismatch")
    }
    if (
      artifact.provenance.sourceSha256 !== currentProvenance.sourceSha256 ||
      artifact.provenance.collectorSha256 !== currentProvenance.collectorSha256
    ) {
      throw new Error("provenance mismatch")
    }
    return { artifact }
  } catch {
    return { evidenceGap: `${fixture} EXPLAIN evidence is invalid` }
  }
}

export async function runReportCli(argv: readonly string[]): Promise<AuditablePerformanceReport> {
  const args = parseCli(argv)
  const raw = await readFile(args.raw, "utf8")
  assertArtifactIsSanitized(raw)
  const samples = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PerformanceSample)
  const evidence = JSON.parse(await readFile(args.evidence, "utf8")) as unknown
  const buildIdentity = JSON.parse(await readFile(args.buildIdentity, "utf8")) as unknown
  const currentProvenance = await loadCurrentQueryPlanProvenance()
  const loadedPlans = await Promise.all([
    loadQueryPlan("normal", args.normalPlan, currentProvenance),
    loadQueryPlan("stress", args.stressPlan, currentProvenance),
  ])
  const queryPlans = loadedPlans.flatMap((result) => (result.artifact ? [result.artifact] : []))
  const planInputGaps = loadedPlans.flatMap((result) =>
    result.evidenceGap ? [result.evidenceGap] : [],
  )
  const readyForDecision =
    planInputGaps.length === 0 && queryPlans.every((artifact) => artifact.status === "ready")
  const decision = readyForDecision
    ? deriveD014Decision(queryPlans)
    : {
        requiresPersistentDatabaseChange: false,
        basis:
          "D-014 is unverified because complete normal and stress EXPLAIN evidence is unavailable",
      }
  assertBuildIdentity(buildIdentity)
  assertOperationalEvidence(evidence, buildIdentity.id)
  const report = await writeAuditableReport({
    samples,
    evidence,
    buildIdentity,
    jsonPath: args.json,
    markdownPath: args.markdown,
    databaseEvidence: { artifacts: queryPlans, decision, evidenceGaps: planInputGaps },
  })
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runReportCli(process.argv.slice(2))
    .then((report) => {
      process.exitCode = report.gate.status === "pass" ? 0 : 1
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
