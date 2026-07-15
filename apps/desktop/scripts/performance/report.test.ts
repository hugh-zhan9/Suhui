import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"

import type { PerformanceSample, PerformanceSurface } from "./contracts.ts"
import type { QueryPlanArtifact } from "./query-plan.ts"
import { applicationSummaryProjection } from "./query-plan.ts"
import { representativeTestStatements } from "./query-plan-test-fixtures.ts"
import {
  applyQueryPlanDecision,
  deriveD014Decision,
  evaluatePerformanceSamples,
  thresholdForSurface,
} from "./report.ts"

const statementSha256 = (statement: string) => createHash("sha256").update(statement).digest("hex")

const samples = (
  surface: PerformanceSurface,
  temperature: "cold" | "warm",
  durationMs: number,
  count = 20,
): PerformanceSample[] =>
  Array.from({ length: count }, (_, index) => ({
    buildId: "a".repeat(64),
    runId: `${temperature}-${surface}-${index}`,
    fixture: "normal",
    temperature,
    surface,
    success: true,
    durationMs,
    metrics: {},
  }))

test("accepts threshold equality and rejects the smallest P95 breach", () => {
  const surface = "remote-shell" as const
  const threshold = thresholdForSurface(surface)
  const pass = evaluatePerformanceSamples(samples(surface, "cold", threshold), {
    fixtures: ["normal"],
    temperatures: ["cold"],
    surfaces: [surface],
  })
  assert.equal(pass.gate.status, "pass")

  const fail = evaluatePerformanceSamples(samples(surface, "cold", threshold + 1), {
    fixtures: ["normal"],
    temperatures: ["cold"],
    surfaces: [surface],
  })
  assert.equal(fail.gate.status, "fail")
  assert.deepEqual(fail.gate.failures, [
    { group: "normal/cold/remote-shell", observedP95: threshold + 1, thresholdMs: threshold },
  ])
})

test("marks an under-20 group unverified", () => {
  const result = evaluatePerformanceSamples(samples("desktop-shell", "cold", 10, 19), {
    fixtures: ["normal"],
    temperatures: ["cold"],
    surfaces: ["desktop-shell"],
  })
  assert.equal(result.gate.status, "unverified")
  assert.match(result.gate.evidenceGaps[0] ?? "", /20 successful valid samples/)
})

test("evaluates cold and warm groups separately", () => {
  const result = evaluatePerformanceSamples(
    [
      ...samples("desktop-feed-usable", "cold", 300),
      ...samples("desktop-feed-usable", "warm", 301),
    ],
    {
      fixtures: ["normal"],
      temperatures: ["cold", "warm"],
      surfaces: ["desktop-feed-usable"],
    },
  )
  assert.equal(result.groups.length, 2)
  assert.equal(result.groups.find((group) => group.temperature === "cold")?.status, "pass")
  assert.equal(result.groups.find((group) => group.temperature === "warm")?.status, "fail")
})

test("never promotes error or missing-duration samples to ready", () => {
  const valid = samples("remote-data-ready", "cold", 100, 19)
  const result = evaluatePerformanceSamples(
    [
      ...valid,
      {
        ...valid[0]!,
        runId: "visible-error",
        success: false,
        durationMs: null,
        errorCode: "REMOTE_BOOTSTRAP_FAILED",
        metrics: { remote_bootstrap_error_visible_ms: 20 },
      },
      { ...valid[0]!, runId: "invalid-ready", success: true, durationMs: null },
    ],
    {
      fixtures: ["normal"],
      temperatures: ["cold"],
      surfaces: ["remote-data-ready"],
    },
  )
  assert.equal(result.gate.status, "unverified")
  assert.equal(result.groups[0]?.successfulSamples, 19)
  assert.equal(result.groups[0]?.failedSamples, 2)
})

const queryPlanArtifact = (
  fixture: "normal" | "stress",
  status: "ready" | "unverified" = "ready",
): QueryPlanArtifact => ({
  schema: "suhui.performance-query-plan.v1",
  fixture,
  seed: "suhui-performance-v1",
  status,
  provenance: {
    sourceSha256: "a".repeat(64),
    collectorSha256: "b".repeat(64),
  },
  statements:
    status === "ready"
      ? (["timeline", "unread_timeline", "multi_feed", "stable_keyset"] as const).map((id) => {
          const statement = representativeTestStatements(fixture)[id]
          return {
            id,
            statement,
            statementSha256: statementSha256(statement),
            projection: applicationSummaryProjection,
            boundedRows: 21 as const,
            plan: {
              planningMs: 1,
              executionMs: 2,
              actualRows: 20,
              actualTotalMs: 1.9,
              sharedHitBlocks: 1,
              sharedReadBlocks: 0,
              tempReadBlocks: 0,
              tempWrittenBlocks: 0,
              rowsRemovedByFilter: 0,
              nodeTypes: ["Limit"],
            },
          }
        })
      : [],
  evidenceGaps: status === "ready" ? [] : ["EXPLAIN unavailable"],
})

test("missing normal or stress EXPLAIN forces unverified without weakening P95 failures", () => {
  const result = applyQueryPlanDecision(
    {
      status: "fail",
      failures: [{ group: "stress/cold/remote-data-ready", observedP95: 1670, thresholdMs: 1500 }],
      evidenceGaps: [],
    },
    [queryPlanArtifact("normal")],
    { requiresPersistentDatabaseChange: false, basis: "not evaluated" },
  )
  assert.equal(result.status, "unverified")
  assert.equal(result.failures.length, 1)
  assert.match(result.evidenceGaps.join("\n"), /stress.*EXPLAIN/i)
})

test("D-014 stop status propagates with its evidence basis", () => {
  const result = applyQueryPlanDecision(
    {
      status: "fail",
      failures: [{ group: "stress/cold/remote-data-ready", observedP95: 1670, thresholdMs: 1500 }],
      evidenceGaps: [],
    },
    [queryPlanArtifact("normal"), queryPlanArtifact("stress")],
    {
      requiresPersistentDatabaseChange: true,
      basis: "representative list queries exceed the owning surface budget and require an index",
    },
  )
  assert.equal(result.status, "stop_return_to_spec")
  assert.match(result.databaseStopReason ?? "", /require an index/)
  assert.equal(result.failures.length, 1)
})

test("D-014 positive evidence stops even when sampled surfaces otherwise pass", () => {
  const result = applyQueryPlanDecision(
    { status: "pass", failures: [], evidenceGaps: [] },
    [queryPlanArtifact("normal"), queryPlanArtifact("stress")],
    { requiresPersistentDatabaseChange: true, basis: "representative query exceeds 300ms" },
  )
  assert.equal(result.status, "stop_return_to_spec")
  assert.match(result.databaseStopReason ?? "", /exceeds 300ms/)
})

test("complete plans preserve a truthful fail when DB change is not required", () => {
  const result = applyQueryPlanDecision(
    {
      status: "fail",
      failures: [
        { group: "normal/cold/desktop-feed-usable", observedP95: 325.9, thresholdMs: 300 },
      ],
      evidenceGaps: [],
    },
    [queryPlanArtifact("normal"), queryPlanArtifact("stress")],
    {
      requiresPersistentDatabaseChange: false,
      basis: "EXPLAIN execution is below the surface breach delta",
    },
  )
  assert.equal(result.status, "fail")
  assert.equal(result.evidenceGaps.length, 0)
  assert.equal(result.failures.length, 1)
})

test("derives a no-persistent-change decision only from eight completed sub-budget plans", () => {
  const decision = deriveD014Decision([queryPlanArtifact("normal"), queryPlanArtifact("stress")])
  assert.equal(decision.requiresPersistentDatabaseChange, false)
  assert.match(decision.basis, /below the 300ms usable-list budget/)
})

test("derives a positive persistent-change decision without throwing", () => {
  const stress = queryPlanArtifact("stress")
  stress.statements[0]!.plan.executionMs = 301
  const decision = deriveD014Decision([queryPlanArtifact("normal"), stress])
  assert.equal(decision.requiresPersistentDatabaseChange, true)
  assert.match(decision.basis, /301ms exceeds the 300ms/)
})
