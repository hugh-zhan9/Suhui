import assert from "node:assert/strict"
import { test } from "node:test"

import type { PerformanceSample } from "./contracts.ts"
import { nearestRank, summarizeSuccessfulSamples } from "./stats.ts"

const sample = (
  runId: string,
  durationMs: number | null,
  options: Partial<PerformanceSample> = {},
): PerformanceSample => ({
  runId,
  fixture: "normal",
  temperature: "cold",
  surface: "desktop-shell",
  success: durationMs !== null,
  durationMs,
  metrics: {},
  ...options,
})

test("nearestRank sorts a copy and uses ceil(p*n)-1", () => {
  const values = [20, 1, 10, 19, 5]
  assert.equal(nearestRank(values, 0.5), 10)
  assert.equal(nearestRank(values, 0.95), 20)
  assert.deepEqual(values, [20, 1, 10, 19, 5])
  assert.throws(() => nearestRank([], 0.95), /non-empty/)
  assert.throws(() => nearestRank([1], 0), /percentile/)
  assert.throws(() => nearestRank([Number.NaN], 0.95), /finite/)
})

test("requires at least 20 successful valid samples and reports nearest-rank values", () => {
  const samples = Array.from({ length: 20 }, (_, index) => sample(`run-${index}`, index + 1))
  assert.deepEqual(summarizeSuccessfulSamples(samples), { count: 20, p50: 10, p95: 19, max: 20 })
  assert.throws(() => summarizeSuccessfulSamples(samples.slice(0, 19)), /at least 20/)
})

test("excludes application failures without promoting them to valid samples", () => {
  const successes = Array.from({ length: 20 }, (_, index) => sample(`ok-${index}`, index + 1))
  const failures = [
    sample("failed", null, { success: false, errorCode: "ENTRY_QUERY_FAILED" }),
    sample("invalid-success", null, { success: true }),
  ]
  assert.deepEqual(summarizeSuccessfulSamples([...successes, ...failures]), {
    count: 20,
    p50: 10,
    p95: 19,
    max: 20,
  })
})

test("invalidates the whole group on an environment failure", () => {
  const samples = Array.from({ length: 20 }, (_, index) => sample(`ok-${index}`, index + 1))
  samples.push(
    sample("env-failed", null, { success: false, errorCode: "ENVIRONMENT_BROWSER_CRASH" }),
  )
  assert.throws(() => summarizeSuccessfulSamples(samples), /environment failure/)
})

test("does not mix groups or trim high samples", () => {
  const samples = [
    ...Array.from({ length: 18 }, (_, index) => sample(`run-${index}`, index + 1)),
    sample("outlier-1", 9_999),
    sample("outlier-2", 10_000),
  ]
  assert.deepEqual(summarizeSuccessfulSamples(samples), {
    count: 20,
    p50: 10,
    p95: 9_999,
    max: 10_000,
  })
  assert.throws(
    () => summarizeSuccessfulSamples([...samples, sample("warm", 2, { temperature: "warm" })]),
    /same fixture, temperature, and surface/,
  )
})
