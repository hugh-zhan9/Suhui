import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { test } from "node:test"

import { join } from "pathe"

import {
  assertCurrentBuildIdentity,
  collectBuildIdentity,
  collectTaskDiffHash,
  createBuildIdentityId,
  hasTaskSourceChanges,
  isProductionArtifactName,
  productionSourceScopes,
} from "./build-identity.ts"
import type { PerformanceSample, PerformanceSurface } from "./contracts.ts"
import { selectSampleMetricsForSurface } from "./contracts.ts"
import type { RefreshEvidence } from "./evidence.ts"
import {
  assertPerformanceSample,
  assertPerformanceSampleSet,
  collectOperationalEvidence,
  REQUIRED_STABLE_METRICS,
  STABLE_METRIC_ORIGINS,
} from "./evidence.ts"
import {
  applicationSummaryProjection,
  buildQueryPlanArtifact,
  loadCurrentQueryPlanProvenance,
  representativeStatementIds,
} from "./query-plan.ts"
import { representativeTestStatements } from "./query-plan-test-fixtures.ts"
import {
  assertArtifactIsSanitized,
  assertRequiredStableMetrics,
  runReportCli,
  sanitizeMetricRecord,
  writeAuditableReport,
} from "./report.ts"
import { verifyArtifactSet } from "./verify-artifacts.ts"

test("defines every stable D-013 metric", () => {
  assertRequiredStableMetrics(REQUIRED_STABLE_METRICS)
  assert.deepEqual(REQUIRED_STABLE_METRICS, [
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
  ])
  assert.deepEqual(Object.keys(STABLE_METRIC_ORIGINS), REQUIRED_STABLE_METRICS)
  assert.equal(STABLE_METRIC_ORIGINS.refresh_batch_event_count.source, "refresh")
  assert.deepEqual(STABLE_METRIC_ORIGINS.entry_list_payload_bytes.surfaces, ["remote-data-ready"])
})

test("rejects sensitive keys, values, paths, connection strings, and full URL queries", () => {
  assert.deepEqual(sanitizeMetricRecord({ entry_query_rows: 20 }), { entry_query_rows: 20 })
  for (const serialized of [
    '{"title":"private"}',
    '{"body":"private"}',
    '{"content":"private"}',
    '{"url":"https://example.test/item?secret=value"}',
    '{"detail":"/Users/example/private"}',
    '{"detail":"/tmp/private-plan.json"}',
    '{"detail":"/private/tmp/private-plan.json"}',
    '{"detail":"/var/folders/xx/private-plan.json"}',
    '{"detail":"C:\\\\Users\\\\example\\\\private-plan.json"}',
    '{"detail":"C:\\\\Temp\\\\private-plan.json"}',
    '{"connection":"postgres://user:secret@localhost/db"}',
    '{"nested":{"sqlParameters":["private"]}}',
    '{"nested":{"sql_params":["private"]}}',
    '{"nested":{"params":["private"]}}',
  ]) {
    assert.throws(() => assertArtifactIsSanitized(serialized), /sensitive performance artifact/)
  }
  assert.doesNotThrow(() =>
    assertArtifactIsSanitized(
      '{"entry_query_rows":20,"entry_list_payload_bytes":4096,"errorCode":"REMOTE_FAILED"}',
    ),
  )
})

test("rejects stale dist sibling and archive paths from production identity", () => {
  assert.equal(isProductionArtifactName("dist/main/index.js"), true)
  assert.equal(isProductionArtifactName("dist/preload/index.mjs"), true)
  assert.equal(isProductionArtifactName("dist/renderer/assets/main.js"), true)
  assert.equal(isProductionArtifactName("dist/main 2/index.js"), false)
  assert.equal(isProductionArtifactName("dist/preload 3/index.mjs"), false)
  assert.equal(isProductionArtifactName("dist/render-asset.tar.gz"), false)
})

test("production source identity detects tracked and untracked utils drift only in scope", async () => {
  const root = await mkdtemp(join(tmpdir(), "suhui-build-identity-test-"))
  const write = async (name: string, content: string) => {
    const path = join(root, name)
    await mkdir(join(path, ".."), { recursive: true })
    await writeFile(path, content)
  }
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trimEnd()

  git(["init", "--quiet"])
  git(["config", "user.email", "performance-test@example.invalid"])
  git(["config", "user.name", "Performance Test"])
  await Promise.all([
    write("apps/desktop/source.ts", "export const desktop = 1\n"),
    write("packages/internal/store/source.ts", "export const store = 1\n"),
    write("packages/internal/utils/src/jotai.ts", "export const utility = 1\n"),
    write(".gitignore", "dist\n"),
    write(".vscode/settings.json", "{}\n"),
  ])
  git(["add", "."])
  git(["commit", "--quiet", "-m", "fixture"])

  const baselineTaskDiff = await collectTaskDiffHash(root)
  const baseIdentity = {
    schema: "suhui.performance-build.v1" as const,
    headCommit: git(["rev-parse", "HEAD"]),
    dirty: false,
    taskDiffSha256: baselineTaskDiff,
    artifactHashes: [{ name: "dist/main/index.js", sha256: "a".repeat(64), bytes: 1 }],
  }
  const recordedIdentity = {
    ...baseIdentity,
    id: createBuildIdentityId(baseIdentity),
    generatedAt: "2026-07-16T00:00:00.000Z",
  }

  await write("packages/internal/utils/src/jotai.ts", "export const utility = 2\n")
  const trackedTaskDiff = await collectTaskDiffHash(root)
  assert.notEqual(trackedTaskDiff, baselineTaskDiff)
  const trackedCurrent = {
    ...recordedIdentity,
    dirty: true,
    taskDiffSha256: trackedTaskDiff,
    id: createBuildIdentityId({
      ...baseIdentity,
      dirty: true,
      taskDiffSha256: trackedTaskDiff,
    }),
  }
  assert.throws(
    () => assertCurrentBuildIdentity(recordedIdentity, trackedCurrent),
    /production build identity is stale/,
  )

  await write("packages/internal/utils/src/jotai.ts", "export const utility = 1\n")
  await write("packages/internal/utils/src/untracked.ts", "export const untracked = true\n")
  const untrackedTaskDiff = await collectTaskDiffHash(root)
  assert.notEqual(untrackedTaskDiff, baselineTaskDiff)
  const untrackedCurrent = {
    ...recordedIdentity,
    dirty: true,
    taskDiffSha256: untrackedTaskDiff,
    id: createBuildIdentityId({
      ...baseIdentity,
      dirty: true,
      taskDiffSha256: untrackedTaskDiff,
    }),
  }
  assert.throws(
    () => assertCurrentBuildIdentity(recordedIdentity, untrackedCurrent),
    /production build identity is stale/,
  )

  await rm(join(root, "packages/internal/utils/src/untracked.ts"))
  await Promise.all([
    write(".gitignore", "dist\ncoverage\n"),
    write(".vscode/settings.json", '{"editor.formatOnSave":true}\n'),
  ])
  assert.deepEqual(productionSourceScopes, [
    "apps/desktop",
    "packages/internal/store",
    "packages/internal/utils",
  ])
  assert.equal(await hasTaskSourceChanges(root), false)
  const outOfScopeTaskDiff = await collectTaskDiffHash(root)
  assert.equal(outOfScopeTaskDiff, baselineTaskDiff)
  const outOfScopeCurrent = {
    ...recordedIdentity,
    taskDiffSha256: outOfScopeTaskDiff,
    id: createBuildIdentityId({ ...baseIdentity, taskDiffSha256: outOfScopeTaskDiff }),
  }
  assert.doesNotThrow(() => assertCurrentBuildIdentity(recordedIdentity, outOfScopeCurrent))
})

const surfaces: PerformanceSurface[] = [
  "desktop-shell",
  "desktop-db-to-interactive",
  "desktop-feed-usable",
  "desktop-unread-usable",
  "remote-shell",
  "remote-data-ready",
]

test("mandatory verifier accepts extra valid samples and checks exact raw/report identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "suhui-artifact-test-"))
  const buildIdentity = await collectBuildIdentity()
  assert.ok(
    buildIdentity.artifactHashes.every((artifact) => isProductionArtifactName(artifact.name)),
  )
  assert.equal(
    buildIdentity.artifactHashes.some((artifact) =>
      /dist\/(?:main|preload) [23]\//.test(artifact.name),
    ),
    false,
  )
  const metrics = {
    shell_ready_ms: 1,
    db_usable_ms: 1,
    interactive_ms: 2,
    db_usable_to_interactive_ms: 1,
    route_scope_ready_ms: 1,
    desktop_initial_entries_ready_ms: 1,
    desktop_startup_entry_rows: 20,
    desktop_feed_usable_ms: 1,
    desktop_unread_usable_ms: 1,
    entry_query_duration_ms: 1,
    entry_query_rows: 20,
    entry_fetch_to_store_ms: 1,
    entry_list_payload_bytes: 100,
    remote_shell_visible_ms: 1,
    remote_bootstrap_ready_ms: 1,
    remote_initial_entries_ready_ms: 1,
    remote_data_ready_ms: 1,
  }
  const samples: PerformanceSample[] = []
  for (const fixture of ["normal", "stress"] as const) {
    for (const temperature of ["cold", "warm"] as const) {
      for (const surface of surfaces) {
        for (let index = 0; index < 21; index += 1) {
          samples.push({
            buildId: buildIdentity.id,
            runId: `${surface.startsWith("desktop") ? "desktop" : "remote"}-${fixture}-${temperature}-${index}`,
            fixture,
            temperature,
            surface,
            success: true,
            durationMs: 1,
            metrics: selectSampleMetricsForSurface(metrics, surface),
          })
        }
      }
    }
  }
  samples.push(
    {
      ...samples[0]!,
      runId: "bootstrap-failure",
      surface: "remote-data-ready",
      success: false,
      durationMs: null,
      errorCode: "INJECTED_REMOTE_BOOTSTRAP_FAILURE",
      metrics: selectSampleMetricsForSurface(
        {
          ...metrics,
          remote_bootstrap_error_visible_ms: 2,
          injected_retry_final_success_ms: 3,
        },
        "remote-data-ready",
      ),
    },
    {
      ...samples[0]!,
      runId: "entries-failure",
      surface: "remote-data-ready",
      success: false,
      durationMs: null,
      errorCode: "INJECTED_REMOTE_ENTRIES_FAILURE",
      metrics: selectSampleMetricsForSurface(
        {
          ...metrics,
          remote_entries_error_visible_ms: 2,
          injected_retry_final_success_ms: 3,
        },
        "remote-data-ready",
      ),
    },
  )
  const desktopRunner = await readFile(new URL("run-desktop.ts", import.meta.url))
  const refresh: RefreshEvidence = {
    schema: "suhui.performance-refresh.v1",
    buildId: buildIdentity.id,
    collectorSha256: createHash("sha256").update(desktopRunner).digest("hex"),
    records: ([1, 10, 50] as const).map((feedCount) => ({
      feedCount,
      refresh_batch_event_count: 1,
      refresh_renderer_refetch_count: 1,
      total_entry_query_reloads: 1,
    })),
  }
  const evidence = await collectOperationalEvidence({ buildIdentity, samples, refresh })
  assert.equal(evidence.stableMetrics.entry_list_payload_bytes.count, 86)
  assert.equal(evidence.stableMetrics.entry_query_duration_ms.count, 170)
  assert.equal(evidence.stableMetrics.refresh_batch_event_count.count, 3)
  assert.equal(evidence.priorBundle.desktopInitialJsBytes, 3_400_157)
  assert.equal(evidence.priorBundle.remoteInitialJsBytes, 1_015_558)
  const names = {
    raw: join(root, "raw-samples.jsonl"),
    report: join(root, "report.json"),
    evidence: join(root, "operational-evidence.json"),
    buildIdentity: join(root, "build-identity.json"),
  }
  await Promise.all([
    writeFile(names.raw, `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`),
    writeFile(names.evidence, `${JSON.stringify(evidence)}\n`),
    writeFile(names.buildIdentity, `${JSON.stringify(buildIdentity)}\n`),
    writeAuditableReport({
      samples,
      evidence,
      buildIdentity,
      jsonPath: names.report,
      markdownPath: join(root, "report.md"),
    }),
  ])
  const result = await verifyArtifactSet(names, { verifyCurrentBuild: false })
  assert.equal(result.samples, 506)
  assert.equal(result.gate.status, "pass")

  const failingSamples = samples.map((sample) =>
    sample.surface === "desktop-feed-usable" && sample.success
      ? { ...sample, durationMs: 301 }
      : sample,
  )
  await writeFile(
    names.raw,
    `${failingSamples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
  )
  const currentProvenance = await loadCurrentQueryPlanProvenance()
  const plan = (fixture: "normal" | "stress", executionMs = 2) =>
    buildQueryPlanArtifact({
      fixture,
      ...currentProvenance,
      statements: representativeStatementIds.map((id, index) => ({
        id,
        statement: representativeTestStatements(fixture)[id],
        projection: applicationSummaryProjection,
        boundedRows: 21,
        plan: {
          planningMs: 1,
          executionMs: index === 0 ? executionMs : 2,
          actualRows: 20,
          actualTotalMs: 1.9,
          sharedHitBlocks: 1,
          sharedReadBlocks: 0,
          tempReadBlocks: 0,
          tempWrittenBlocks: 0,
          rowsRemovedByFilter: 0,
          nodeTypes: ["Limit"],
        },
      })),
    })
  const normalPlan = join(root, "normal-plan.json")
  const stressPlan = join(root, "stress-plan.json")
  const runCase = async (name: string, normalPath = normalPlan) => {
    const json = join(root, `${name}.json`)
    const markdown = join(root, `${name}.md`)
    const report = await runReportCli([
      "--raw",
      names.raw,
      "--json",
      json,
      "--markdown",
      markdown,
      "--evidence",
      names.evidence,
      "--build-identity",
      names.buildIdentity,
      "--normal-plan",
      normalPath,
      "--stress-plan",
      stressPlan,
    ])
    assert.equal(JSON.parse(await readFile(json, "utf8")).gate.status, report.gate.status)
    assert.match(
      await readFile(markdown, "utf8"),
      new RegExp(`Verdict: \\*\\*${report.gate.status}`),
    )
    assert.equal(JSON.stringify(report).includes(root), false)
    assert.doesNotThrow(() => assertArtifactIsSanitized(JSON.stringify(report)))
    return report
  }

  await writeFile(stressPlan, `${JSON.stringify(plan("stress"))}\n`)
  const missing = await runCase("missing", join(root, "absent-normal-plan.json"))
  assert.equal(missing.gate.status, "unverified")
  assert.match(missing.gate.evidenceGaps.join("\n"), /normal EXPLAIN evidence is missing/i)

  const malformedPlan = join(root, "malformed-normal-plan.json")
  await writeFile(malformedPlan, "{malformed")
  const malformed = await runCase("malformed", malformedPlan)
  assert.equal(malformed.gate.status, "unverified")
  assert.match(malformed.gate.evidenceGaps.join("\n"), /malformed/i)

  const unverifiedPlan = buildQueryPlanArtifact({
    fixture: "normal",
    ...currentProvenance,
    statements: [],
    evidenceGap: "database unavailable",
  })
  await writeFile(normalPlan, `${JSON.stringify(unverifiedPlan)}\n`)
  const unverified = await runCase("unverified")
  assert.equal(unverified.gate.status, "unverified")
  assert.match(unverified.gate.evidenceGaps.join("\n"), /database unavailable/i)

  await Promise.all([
    writeFile(normalPlan, `${JSON.stringify(plan("normal"))}\n`),
    writeFile(stressPlan, `${JSON.stringify(plan("stress", 301))}\n`),
  ])
  const positiveStop = await runCase("positive-stop")
  assert.equal(positiveStop.gate.status, "stop_return_to_spec")
  assert.match(positiveStop.gate.databaseStopReason ?? "", /301ms exceeds the 300ms/)
  assert.ok(positiveStop.gate.failures.length > 0)

  const staleProvenance = plan("normal")
  staleProvenance.provenance = {
    sourceSha256: "c".repeat(64),
    collectorSha256: "d".repeat(64),
  }
  await Promise.all([
    writeFile(normalPlan, `${JSON.stringify(staleProvenance)}\n`),
    writeFile(stressPlan, `${JSON.stringify(plan("stress"))}\n`),
  ])
  const stale = await runCase("stale-provenance")
  assert.equal(stale.gate.status, "unverified")
  assert.match(stale.gate.evidenceGaps.join("\n"), /normal EXPLAIN evidence is invalid/i)
  assert.doesNotMatch(stale.gate.evidenceGaps.join("\n"), /c{64}|d{64}/)

  const conjunctionDrift = plan("normal")
  const changed = conjunctionDrift.statements[0]!
  changed.statement = changed.statement.replace(" and ", " or ")
  changed.statementSha256 = createHash("sha256").update(changed.statement).digest("hex")
  await Promise.all([
    writeFile(normalPlan, `${JSON.stringify(conjunctionDrift)}\n`),
    writeFile(stressPlan, `${JSON.stringify(plan("stress"))}\n`),
  ])
  const invalidShape = await runCase("invalid-canonical-shape")
  assert.equal(invalidShape.gate.status, "unverified")
  assert.match(invalidShape.gate.evidenceGaps.join("\n"), /normal EXPLAIN evidence is invalid/i)
})

test("closes sample fields, metric keys, origins, and run/surface identity", () => {
  const base: PerformanceSample = {
    buildId: "a".repeat(64),
    runId: "remote-normal-cold-00",
    fixture: "normal",
    temperature: "cold",
    surface: "remote-shell",
    success: true,
    durationMs: 1,
    metrics: {},
  }
  assert.throws(
    () => assertPerformanceSample({ ...base, metrics: { entry_query_rows: 20 } }),
    /invalid sample metric/,
  )
  assert.throws(
    () => assertPerformanceSample({ ...base, metrics: { arbitrary_required_metric: 1 } }),
    /invalid sample metric/,
  )
  assert.throws(
    () => assertPerformanceSample({ ...base, unexpected: "field" }),
    /closed schema mismatch/,
  )
  assert.throws(() => assertPerformanceSampleSet([base, { ...base }]), /duplicate run\/surface/)
})

test("mandatory verifier fails when artifacts are absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "suhui-artifact-missing-"))
  await assert.rejects(
    verifyArtifactSet({
      raw: join(root, "raw-samples.jsonl"),
      report: join(root, "report.json"),
      evidence: join(root, "operational-evidence.json"),
      buildIdentity: join(root, "build-identity.json"),
    }),
    /ENOENT/,
  )
})
