#!/usr/bin/env tsx

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

import {
  assertBuildIdentity,
  defaultBuildIdentityFile,
  loadCurrentBuildIdentity,
} from "./build-identity.ts"
import type { PerformanceBuildIdentity, PerformanceSample } from "./contracts.ts"
import {
  REQUIRED_STABLE_METRICS,
  assertOperationalEvidence,
  assertPerformanceSample,
  assertPerformanceSampleSet,
  collectOperationalEvidence,
  type OperationalEvidence,
} from "./evidence.ts"
import {
  assertArtifactIsSanitized,
  assertRequiredStableMetrics,
  evaluatePerformanceSamples,
  type AuditablePerformanceReport,
} from "./report.ts"

export type ArtifactNames = {
  raw: string
  report: string
  evidence: string
  buildIdentity: string
}

const parseSamples = (serialized: string) => {
  const samples = serialized
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
  samples.forEach(assertPerformanceSample)
  assertPerformanceSampleSet(samples)
  return samples as PerformanceSample[]
}

export async function verifyArtifactSet(
  names: ArtifactNames,
  options: { verifyCurrentBuild?: boolean } = {},
) {
  const [rawSerialized, reportSerialized, evidenceSerialized, identitySerialized] =
    await Promise.all([
      readFile(names.raw, "utf8"),
      readFile(names.report, "utf8"),
      readFile(names.evidence, "utf8"),
      readFile(names.buildIdentity, "utf8"),
    ])
  for (const serialized of [
    rawSerialized,
    reportSerialized,
    evidenceSerialized,
    identitySerialized,
  ]) {
    assertArtifactIsSanitized(serialized)
  }

  const buildIdentity = JSON.parse(identitySerialized) as unknown
  assertBuildIdentity(buildIdentity)
  if (options.verifyCurrentBuild !== false) {
    const current = await loadCurrentBuildIdentity(names.buildIdentity)
    assert.equal(current.id, buildIdentity.id)
  }
  const evidence = JSON.parse(evidenceSerialized) as unknown
  assertOperationalEvidence(evidence, buildIdentity.id)
  const samples = parseSamples(rawSerialized)
  assert(samples.length > 0, "raw sample artifact is empty")
  assert(
    samples.every((sample) => sample.buildId === buildIdentity.id),
    "mixed raw build identity",
  )

  const report = JSON.parse(reportSerialized) as AuditablePerformanceReport
  assert.equal(
    report.metadata?.buildIdentity?.id,
    buildIdentity.id,
    "report build identity mismatch",
  )
  assert.equal(report.metadata.buildIdentity.taskDiffSha256, buildIdentity.taskDiffSha256)
  assert.deepEqual(report.metadata.buildIdentity.artifactHashes, buildIdentity.artifactHashes)
  assertOperationalEvidence(report.evidence, buildIdentity.id)
  assert.deepEqual(
    report.evidence,
    evidence,
    "report operational evidence differs from collector output",
  )
  assert.deepEqual(report.samples, samples, "report samples differ from raw JSONL")
  assertRequiredStableMetrics(report.metricsPresent)

  const recollectedEvidence = await collectOperationalEvidence({
    buildIdentity,
    samples,
    refresh: evidence.refresh,
  })
  assert.deepEqual(evidence, recollectedEvidence, "operational collector output is stale")

  const recomputed = evaluatePerformanceSamples(samples)
  assert.deepEqual(report.groups, recomputed.groups, "report group summaries are stale")
  assert.deepEqual(report.gate, recomputed.gate, "report verdict is stale")
  assert.equal(report.groups.length, 24)
  for (const group of report.groups) {
    assert(group.successfulSamples >= 20, `${group.key} has fewer than 20 successful samples`)
    const distinctRunIds = new Set(
      samples
        .filter(
          (sample) =>
            sample.fixture === group.fixture &&
            sample.temperature === group.temperature &&
            sample.surface === group.surface &&
            sample.success &&
            sample.durationMs !== null,
        )
        .map((sample) => sample.runId),
    )
    assert(distinctRunIds.size >= 20, `${group.key} has fewer than 20 distinct successful runs`)
  }
  const retainedFailures = new Set(
    samples.filter((sample) => !sample.success).map((sample) => sample.errorCode),
  )
  assert(retainedFailures.has("INJECTED_REMOTE_BOOTSTRAP_FAILURE"))
  assert(retainedFailures.has("INJECTED_REMOTE_ENTRIES_FAILURE"))
  for (const metric of REQUIRED_STABLE_METRICS) {
    assert(evidence.stableMetrics[metric].count > 0, `missing typed metric evidence: ${metric}`)
  }
  return {
    buildIdentity: buildIdentity as PerformanceBuildIdentity,
    evidence: evidence as OperationalEvidence,
    samples: samples.length,
    gate: report.gate,
  }
}

async function runCli(argv: readonly string[]) {
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const result = await verifyArtifactSet({
    raw: resolve(value("--raw") ?? "out/performance/raw-samples.jsonl"),
    report: resolve(value("--report") ?? "out/performance/report.json"),
    evidence: resolve(value("--evidence") ?? "out/performance/operational-evidence.json"),
    buildIdentity: resolve(value("--build-identity") ?? defaultBuildIdentityFile),
  })
  console.log(
    JSON.stringify({
      buildId: result.buildIdentity.id,
      samples: result.samples,
      gate: result.gate.status,
    }),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
