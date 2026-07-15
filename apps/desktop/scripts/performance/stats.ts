import type { PerformanceSample } from "./contracts.ts"

const MINIMUM_SUCCESSFUL_SAMPLES = 20
export const ENVIRONMENT_ERROR_PREFIX = "ENVIRONMENT_"

export function nearestRank(values: readonly number[], percentile: number): number {
  if (values.length === 0) throw new Error("nearestRank requires a non-empty sample")
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new Error("percentile must be greater than 0 and at most 1")
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("nearestRank values must be finite")
  }

  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(percentile * sorted.length) - 1]!
}

const groupKey = (sample: PerformanceSample) =>
  `${sample.fixture}/${sample.temperature}/${sample.surface}`

export function summarizeSuccessfulSamples(samples: readonly PerformanceSample[]): {
  count: number
  p50: number
  p95: number
  max: number
} {
  const groups = new Set(samples.map(groupKey))
  if (groups.size > 1) {
    throw new Error("samples must belong to the same fixture, temperature, and surface")
  }
  if (
    samples.some(
      (sample) => !sample.success && sample.errorCode?.startsWith(ENVIRONMENT_ERROR_PREFIX),
    )
  ) {
    throw new Error("environment failure invalidates the entire sample group")
  }

  const durations = samples
    .filter(
      (sample) =>
        sample.success &&
        sample.durationMs !== null &&
        Number.isFinite(sample.durationMs) &&
        sample.durationMs >= 0,
    )
    .map((sample) => sample.durationMs as number)

  if (durations.length < MINIMUM_SUCCESSFUL_SAMPLES) {
    throw new Error(`at least ${MINIMUM_SUCCESSFUL_SAMPLES} successful valid samples are required`)
  }

  return {
    count: durations.length,
    p50: nearestRank(durations, 0.5),
    p95: nearestRank(durations, 0.95),
    max: Math.max(...durations),
  }
}
