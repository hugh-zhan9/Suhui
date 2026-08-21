# Production 性能、数据库停止条件与打包 Artifact Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this child plan. This is the package completion gate: execute tasks in order, retain raw evidence, and do not stage or commit inside tasks.

**Source:** `docs/loopx/design/2026-07-13-suhui-performance-refactor/需求设计文档.md`

**Goal:** 以固定 normal/stress fixtures、production cold/warm 重复样本、分段指标、SQL/EXPLAIN 证据和真实 Forge artifact 扫描，证明整包满足 AC-6 至 AC-9；当证据要求数据库持久化设计变化时硬停止而不是偷偷加索引。

**Architecture:** 新增独立性能 harness，使用隔离 profile/fixture database 生成确定性数据，驱动 production Desktop 与已运行 Desktop 托管的 Remote 页面，输出可审计 raw samples 和 nearest-rank 报告。harness 聚合前序计划产生的 DB/transport/render/event/bundle 指标，不读取用户数据库。Forge ignore 由纯 predicate 单测和真实 staged/packaged resource tree 双重保护。

**Tech Stack:** TypeScript, Node test/Vitest, Playwright-compatible browser automation or existing browser driver, Electron production build, PostgreSQL/Drizzle existing schema, `EXPLAIN (ANALYZE, BUFFERS)`, Vite/Rollup manifests, Electron Forge, pnpm.

**Support lenses:** `architecture-designer`, `sql-style`, `ddia:quality-review`

## Global Constraints

- Existing Desktop reading, unread, refresh, subscription, and detail behavior must remain compatible.
- Existing remote HTTP routes must remain compatible for current callers.
- Each execution commit must be independently verifiable and reversible.
- Existing unrelated worktree changes in `.gitignore` and `.vscode/settings.json` must be preserved.
- No database engine replacement.
- No persistent schema or data migration redesign.
- No database configuration precedence redesign.
- No Electron, React, Drizzle, router, or state-library replacement.
- No remote authentication or permission redesign.
- No RSS product feature changes.
- No broad repository-wide unused-dependency cleanup without measured startup or artifact impact.
- Keep the existing PostgreSQL storage design; do not add or modify indexes, tables, columns, migrations, database engine, or configuration precedence.
- Entry list default limit is exactly `20`, maximum limit is exactly `100`, and invalid, non-integer, non-numeric, or out-of-range limits must fail explicitly.
- Entry ordering is exactly `publishedAt DESC, insertedAt DESC, id DESC`; `read = NULL` remains unread through `IS NOT TRUE` semantics and serializes as `false`.
- List payloads must never contain `content`, `readabilityContent`, or `readabilityUpdatedAt`.
- Desktop detail visibility is `desktop-non-deleted`; Remote HTTP, Remote PDF, and agent visibility is `active-relations`.
- All `GET /api/entries` results are bounded summary pages shaped as `{data, page}`; no unbounded legacy branch or full-body fallback is allowed.
- `interactive` remains exactly `shellReady && dbUsable && snapshotRestoreSettled`; errors never count as usable-list or data-ready performance success.
- Normal fixture is exactly `400 subscriptions / 10,000 entries`; stress fixture is exactly `800 subscriptions / 100,000 entries`.
- Production-build P95 thresholds are: Desktop `shell_ready_ms <= 1200`, Desktop `interactive_ms - db_usable_ms <= 500`, feed/unread usable list `<= 300`, Remote shell `<= 800`, Remote data ready `<= 1500`, all in milliseconds.
- If application refactoring cannot meet the targets and evidence shows an index/schema change is required, stop execution and return to `clarify/spec`; do not expand database scope during implementation.

## Internal Plan Review

- Plan review mode: subagent
- Reviewer independence: independent
- Unresolved findings: none
- Review evidence: independent `plan-reviewer` reviewed the approved design, canonical requirements, and complete seven-file package; initial verdict `needs_revision` found two Important gaps in plan 01 and no Critical findings.
- Recheck evidence: D-003 now owns a visible-row-only detail queue capped at four concurrent requests and tests five deferred requests plus queued cancellation; D-005 now has an unread navigation integration test proving optimistic removal of `e1` advances to `e2` from pre-removal page order. Independent recheck verdict: `approved`, unresolved findings: none.
- Residual risk: none

## Dependencies

- Plans 01 through 05 must be implemented, verified, reviewed, and committed.
- This plan consumes their stable readiness, entry-query, payload, refresh, Remote, bundle, and sidebar metrics. It may add harness adapters and metric serialization, but must not redefine their semantics.
- A clean child-plan review here is necessary but not sufficient: package mode must then run spec-level `final-review` across the full implementation range.

## File Structure

### Files to create

- `apps/desktop/scripts/performance/contracts.ts` — fixture, sample, report, threshold, and metric contracts.
- `apps/desktop/scripts/performance/fixture.ts` — deterministic normal/stress fixture generator and isolated-profile lifecycle.
- `apps/desktop/scripts/performance/fixture.test.ts` — manifest distribution, repeatability, and user-DB isolation tests.
- `apps/desktop/scripts/performance/stats.ts` — nearest-rank P50/P95/max calculation and valid-sample rules.
- `apps/desktop/scripts/performance/stats.test.ts` — boundary and invalid-sample tests.
- `apps/desktop/scripts/performance/run-desktop.ts` — production Desktop cold/warm runner.
- `apps/desktop/scripts/performance/run-remote.ts` — production Remote cold/warm runner with new browser contexts/cache controls.
- `apps/desktop/scripts/performance/report.ts` — threshold evaluation and machine-readable/human-readable report generation.
- `apps/desktop/scripts/performance/report.test.ts` — threshold, failure, and error-not-ready tests.
- `apps/desktop/scripts/performance/query-plan.ts` — representative generated SQL and `EXPLAIN (ANALYZE, BUFFERS)` collector.
- `apps/desktop/scripts/performance/query-plan.test.ts` — no-schema-write and missing-EXPLAIN status tests.
- `apps/desktop/scripts/performance/artifact.test.ts` — report/raw-sample completeness and sensitive-data guard.
- `apps/desktop/scripts/performance/package-artifact.ts` — locate and inspect the actual staged/packaged app resources tree.
- `apps/desktop/scripts/performance/package-artifact.test.ts` — fake-tree tests for absent RSSHub and retained required resources.

### Files to modify

- `apps/desktop/package.json` — expose deterministic fixture, Desktop/Remote run, report, and gate scripts without adding dev-mode success paths.
- `apps/desktop/scripts/forge-ignore.ts` — ignore `/resources/rsshub` and every descendant using a narrow predicate.
- `apps/desktop/scripts/forge-ignore.test.ts` — assert the predicate even when no local RSSHub directory exists.
- `apps/desktop/scripts/packaging/rsshub-removed.test.ts` — extend from build-script cleanup to real artifact-tree assertions.
- `apps/desktop/forge.config.cts` — continue consuming the shared narrow ignore predicate; do not duplicate path logic.
- `apps/desktop/layer/main/src/application/entry/query-service.ts` — expose sanitized timing/row metrics needed by the harness without logging data values.
- `apps/desktop/layer/main/src/remote/manager.ts` — expose list payload bytes and Remote readiness/error metrics established by prior plans.
- `apps/desktop/layer/main/src/manager/local-feed-refresh-events.ts` — expose batch event counts established by plan 03.
- `apps/desktop/layer/renderer/src/initialize/index.ts` — serialize Desktop readiness metrics without changing `interactive`.
- `apps/desktop/layer/renderer/src/remote/main.tsx` — serialize Remote shell/bootstrap/entries readiness and visible-error metrics without changing state transitions.
- `apps/desktop/layer/renderer/src/providers/local-feed-refresh-sync-provider.tsx` — expose renderer refetch counts established by plan 03.

### Runtime artifacts (generated, not hand-edited)

- `apps/desktop/.performance/<commit>/<fixture>/<surface>/<temperature>/raw-samples.jsonl`
- `apps/desktop/.performance/<commit>/report.json`
- `apps/desktop/.performance/<commit>/report.md`
- `apps/desktop/.performance/<commit>/query-plans/*.json`
- `apps/desktop/.performance/<commit>/bundle/*.json`
- `apps/desktop/.performance/<commit>/artifact/*.json`

If repository ignore rules do not already cover `.performance/`, do not modify the user's dirty `.gitignore`; write generated output under an already ignored build/temp location and record the actual path in evidence.

## Surface Inventory And Caller Proof

| Surface                   | Current source                                           | Gate behavior                                                        | Proof                                 |
| ------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| Startup/readiness metrics | Desktop initialize, Remote main/bootstrap, existing logs | exact definitions retained; errors are separate, not ready           | raw samples and failure injection     |
| Entry query metrics       | `EntryQueryService` from plan 01                         | duration, rows, payload bytes; no body/title/URL/SQL params          | artifact sensitive-data test          |
| Refresh metrics           | plan 03 producer/coordinator                             | event count and renderer refetch count by `batchId`                  | 1/10/50 refresh evidence              |
| Bundle/sidebar metrics    | plan 05 reports                                          | main/Remote asset sizes, requests, commit duration/render count      | report completeness guard             |
| Fixture database/profile  | new performance scripts                                  | isolated, deterministic, cleanup-safe                                | fixture repeatability/isolation tests |
| Forge ignore              | `forge.config.cts` -> `packagerIgnorePatterns`           | narrowly excludes `/resources/rsshub` descendants                    | predicate unit test                   |
| Packaged resources        | Forge package/make output                                | RSSHub absent; app-update and necessary app/module resources present | real tree scan after build            |

Caller-proof searches:

```bash
rg -n 'shell_ready_ms|interactive_ms|db_usable_ms|route_scope_ready_ms|desktop_initial_entries_ready_ms' \
  apps/desktop/layer/renderer/src apps/desktop/layer/main
rg -n 'remote_shell_visible_ms|remote_bootstrap_ready_ms|remote_initial_entries_ready_ms|error_visible_ms' \
  apps/desktop/layer/renderer/src/remote apps/desktop/layer/main/src/remote
rg -n 'refresh_batch_event_count|refresh_renderer_refetch_count|batchId' \
  apps/desktop/layer/main packages/internal/store apps/desktop/layer/renderer/src
rg -n 'packagerIgnorePatterns|shouldIgnorePackagerPath|resources/rsshub' \
  apps/desktop/forge.config.cts apps/desktop/scripts
rg -n 'migrate|migration|CREATE (INDEX|TABLE)|ALTER TABLE' apps/desktop/scripts/performance
```

Negative assertions:

```bash
! rg -n 'content|readabilityContent|title|connectionString|DATABASE_URL|sqlParams' \
  apps/desktop/.performance 2>/dev/null
! find /tmp/folo-forge-out -path '*/resources/rsshub*' -print -quit | grep -q .
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema* '.gitignore' '.vscode/settings.json'
```

Expected: raw/report artifacts contain no sensitive fields; the actual packaged tree has no RSSHub path; no schema/migration/config-precedence or unrelated user file changes exist. The filesystem assertion must run against a real build output located by the artifact helper, not silently pass because a hard-coded directory is missing.

## Exact Interfaces

```ts
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
```

Manifest values are exact: normal `400/10_000`, stress `800/100_000`; views `60/20/10/10`; private and hidden each `5%`; read `60/35/5`; shared `publishedAt >=10%`; body P50 `8 KiB`, P95 `64 KiB`, max `256 KiB`. Both scales use the same distribution and fixed seed.

```ts
export type PerformanceSurface =
  | "desktop-shell"
  | "desktop-db-to-interactive"
  | "desktop-feed-usable"
  | "desktop-unread-usable"
  | "remote-shell"
  | "remote-data-ready"

export type PerformanceSample = {
  runId: string
  fixture: FixtureScale
  temperature: "cold" | "warm"
  surface: PerformanceSurface
  success: boolean
  durationMs: number | null
  errorCode?: string
  metrics: Record<string, number>
}

export function nearestRank(values: readonly number[], percentile: number): number
export function summarizeSuccessfulSamples(samples: readonly PerformanceSample[]): {
  count: number
  p50: number
  p95: number
  max: number
}
```

Only successful usable/data-ready samples participate. Each fixture/surface/temperature group requires at least 20 successful valid samples. Environment failure invalidates and reruns the entire group; samples are never trimmed. `nearestRank` sorts ascending and returns `x[ceil(p*n)-1]`.

```ts
export type GateResult = {
  status: "pass" | "fail" | "unverified" | "stop_return_to_spec"
  failures: Array<{ group: string; observedP95: number; thresholdMs: number }>
  evidenceGaps: string[]
  databaseStopReason?: string
}
```

Thresholds: Desktop shell `1200`; Desktop `interactive-db_usable` `500`; feed/unread usable `300`; Remote shell `800`; Remote initial data `1500` milliseconds. `unverified` cannot be promoted to pass. If completed application refactors still miss a threshold and recorded SQL/EXPLAIN evidence shows an index/schema change is necessary, status is `stop_return_to_spec` and implementation stops.

```ts
export type ArtifactInspection = {
  artifactRoot: string
  rsshubPaths: string[]
  requiredPaths: Record<string, boolean>
}

export function inspectPackagedArtifact(artifactRoot: string): ArtifactInspection
```

Required paths include `resources/app-update.yml`, the packaged application resources, and the node modules/native resources required by the current Forge configuration. The helper must error when the requested artifact root does not exist.

## Tasks

### T-001 / Task 1: Build deterministic isolated fixtures and nearest-rank statistics

**Files:**

- Create: `apps/desktop/scripts/performance/contracts.ts`
- Create: `apps/desktop/scripts/performance/fixture.ts`
- Create: `apps/desktop/scripts/performance/fixture.test.ts`
- Create: `apps/desktop/scripts/performance/stats.ts`
- Create: `apps/desktop/scripts/performance/stats.test.ts`
- Modify: `apps/desktop/package.json`

**Source AC:** `AC-6`, `AC-7`, `AC-8`

**Design anchors:** `D-012`, `D-014`

**Test cases:** `TC-6`

**Support lenses:** `sql-style` for safe existing-schema writes and NULL distribution; `ddia:quality-review` for repeatability/capacity evidence.

**Review focus:**

- Fixture generation uses only the existing schema and an explicit isolated database/profile target; it refuses the normal user profile/database.
- Counts and distributions match the source exactly and are deterministic from the fixed seed, including shared timestamps and body/media/attachment/source samples.
- Cleanup is scoped to the harness-owned target and is safe after partial failure.
- Statistics require at least 20 successful samples per group, implement nearest rank exactly, and do not drop outliers.

**Expected execution evidence:**

- Unit tests prove deterministic manifests/IDs, exact scale counts, distribution tolerances defined by integer rounding, NULL read preservation, body bounds, isolation refusal, and idempotent cleanup.
- Statistics tests prove 20-sample minimum, P50/P95/max, failure exclusion, whole-group invalidation, and no trimming.
- A generated normal and stress manifest with seed and isolated target identifier, without user path/credentials.

**TDD steps:**

- [ ] Add failing manifest and stats tests before implementation.
- [ ] Implement fixed-seed generation using existing Drizzle/schema APIs; add a mandatory harness-owned database/profile marker and refuse any unmarked target.
- [ ] Implement nearest-rank and group validation exactly as specified.
- [ ] Run:

  ```bash
  node --test \
    apps/desktop/scripts/performance/fixture.test.ts \
    apps/desktop/scripts/performance/stats.test.ts
  ```

  Expected: all fixture/statistics tests pass without connecting to or mutating the user's normal database.

- [ ] Generate both manifests in dry-run mode. Expected: exact `400/10_000` and `800/100_000` counts, identical distributions, fixed seed, no DB write in dry run.

- [ ] Run the schema negative search and `git diff --name-only` guard. Expected: no migration/schema/config/unrelated file change.

### T-002 / Task 2: Run production Desktop/Remote cold-warm samples and emit auditable reports

**Files:**

- Create: `apps/desktop/scripts/performance/run-desktop.ts`
- Create: `apps/desktop/scripts/performance/run-remote.ts`
- Create: `apps/desktop/scripts/performance/report.ts`
- Create: `apps/desktop/scripts/performance/report.test.ts`
- Create: `apps/desktop/scripts/performance/artifact.test.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/layer/main/src/application/entry/query-service.ts`
- Modify: `apps/desktop/layer/main/src/remote/manager.ts`
- Modify: `apps/desktop/layer/main/src/manager/local-feed-refresh-events.ts`
- Modify: `apps/desktop/layer/renderer/src/initialize/index.ts`
- Modify: `apps/desktop/layer/renderer/src/remote/main.tsx`
- Modify: `apps/desktop/layer/renderer/src/providers/local-feed-refresh-sync-provider.tsx`

**Source AC:** `AC-4`, `AC-5`, `AC-6`, `AC-7`, `AC-8`

**Design anchors:** `D-007`, `D-008`, `D-009`, `D-010`, `D-012`, `D-013`

**Test cases:** `TC-4`, `TC-5`, `TC-6`

**Support lenses:** `architecture-designer` for end-to-end readiness boundaries; `ddia:quality-review` for reproducible performance/operability evidence.

**Review focus:**

- Desktop cold clears snapshot/query cache but keeps the fixture DB; warm primes once, exits completely, then restarts with snapshot/cache. Both use production build.
- Remote cold uses a fresh browser context with HTTP cache disabled against an already running Desktop server; warm re-navigates after asset preheat while recreating document/store.
- Shell, data-ready, usable-list, and visible-error timestamps come from actual commit/state transitions. Request start or failure never counts as success.
- Stable metrics include every D-013 name and exclude body/title/full URL query/SQL params/connection strings/local sensitive paths.
- Report includes machine/OS/arch, commit, build mode, seed, raw samples, P50/P95/max, bundle/payload/render/event metrics, and threshold verdict for every fixture/temperature/surface group.

**Expected execution evidence:**

- Unit tests show error samples cannot become ready, missing/under-20 groups fail, cold/warm are evaluated separately, and any P95 breach exits non-zero.
- Production build evidence plus raw JSONL contains at least 20 successful samples for every group, with failures retained separately.
- `TC-4` evidence records 1/10/50-feed `refresh_batch_event_count=1`, active renderer refetch `<=1`, and total reload `<=N` per batch.
- `TC-5` injected delay/failure captures Remote shell and visible loading/error/retry before final success; failure is not counted in data-ready samples.
- Sensitive-data artifact test passes.

**TDD steps:**

- [ ] Add failing report tests for threshold equality/breach, insufficient samples, separate cold/warm verdicts, and error-not-ready.
- [ ] Add sanitized metric serialization at existing measurement points; do not rename or redefine prior-plan readiness states.
- [ ] Implement production Desktop and Remote runners with exact cold/warm lifecycle and group-level invalidation.
- [ ] Implement JSON/Markdown report and non-zero exit on fail/unverified/insufficient evidence.
- [ ] Run:

  ```bash
  node --test \
    apps/desktop/scripts/performance/report.test.ts \
    apps/desktop/scripts/performance/artifact.test.ts
  pnpm --filter @suhui/electron-main exec vitest run \
    src/manager/local-feed-refresh-events.test.ts
  pnpm --filter @suhui/web typecheck
  pnpm --filter @suhui/electron-main typecheck
  ```

  Expected: performance tests and focused refresh test pass; typechecks pass or the known main rootDir/file-list baseline is recorded as fresh `blocked` evidence rather than pass.

- [ ] Build production code:

  ```bash
  pnpm --filter suhui build:electron-vite
  ```

  Expected: production main/renderer build succeeds.

- [ ] Run normal/stress Desktop and Remote cold/warm harness commands exposed in `apps/desktop/package.json`, each until at least 20 successful valid samples exist. Expected: raw samples and report are generated; no failed/error sample is promoted to ready.

### T-003 / Task 3: Capture representative SQL/EXPLAIN evidence and enforce the D-014 stop gate

**Files:**

- Create: `apps/desktop/scripts/performance/query-plan.ts`
- Create: `apps/desktop/scripts/performance/query-plan.test.ts`
- Modify: `apps/desktop/scripts/performance/report.ts`
- Modify: `apps/desktop/scripts/performance/report.test.ts`
- Modify: `apps/desktop/package.json`

**Source AC:** `AC-6`, `AC-7`, `AC-8`

**Design anchors:** `D-002`, `D-003`, `D-012`, `D-013`, `D-014`

**Test cases:** `TC-6`

**Support lenses:** `sql-style` for generated SQL/projection/EXPLAIN discipline; `architecture-designer` for the stop decision boundary.

**Review focus:**

- Representative normal/stress list queries cover timeline/unread/multi-feed and stable keyset pages using the application-generated SQL, summary projection, predicates, order, and limit.
- `EXPLAIN (ANALYZE, BUFFERS)` is read-only evidence on the isolated fixture; output is sanitized and linked to fixture/seed/query shape.
- Missing EXPLAIN produces `unverified`, never pass. A conclusion that index/schema is required produces `stop_return_to_spec`; no task edits schema, migrations, engine, or config precedence.
- Application-level projection, predicate, join/exists, keyset, and batching changes remain allowed only in their owning earlier plan; this gate does not redesign queries.

**Expected execution evidence:**

- Query-plan unit tests prove the collector refuses write SQL, reports missing DB/EXPLAIN as evidence gap, and never emits SQL parameters or connection strings.
- Normal/stress query-plan artifacts contain generated SQL shape plus sanitized plan/actual rows/buffers/timing evidence.
- Final gate explicitly records `pass`, `fail`, `unverified`, or `stop_return_to_spec` and the evidence basis.
- Migration/schema diff guard is empty.

**TDD steps:**

- [ ] Add failing tests for write-statement refusal, missing EXPLAIN, sanitization, and stop status propagation.
- [ ] Implement collection of the application-generated representative queries and read-only `EXPLAIN (ANALYZE, BUFFERS)` on both isolated fixtures.
- [ ] Integrate evidence gaps and stop status into report output/exit code.
- [ ] Run:

  ```bash
  node --test \
    apps/desktop/scripts/performance/query-plan.test.ts \
    apps/desktop/scripts/performance/report.test.ts
  ```

  Expected: all query-plan/gate tests pass.

- [ ] Run the query-plan command for normal and stress fixtures. Expected: each representative query has a sanitized EXPLAIN artifact. If DB execution is unavailable, status is `unverified` and completion is blocked.

- [ ] Evaluate D-014: if thresholds still fail and evidence shows an index/schema change is required, stop immediately, preserve raw/report/EXPLAIN evidence, and return to `clarify/spec`. Do not continue to T-004 or modify DB files.

- [ ] Run:

  ```bash
  git diff --name-only -- \
    'apps/**/migrations/**' 'packages/**/migrations/**' '*schema* \
    '.gitignore' '.vscode/settings.json'
  ```

  Expected: empty for DB/schema/config and unchanged user-owned files.

### T-004 / Task 4: Narrowly exclude RSSHub and inspect a real Forge artifact

**Files:**

- Modify: `apps/desktop/scripts/forge-ignore.ts`
- Modify: `apps/desktop/scripts/forge-ignore.test.ts`
- Modify: `apps/desktop/scripts/packaging/rsshub-removed.test.ts`
- Modify: `apps/desktop/forge.config.cts`
- Create: `apps/desktop/scripts/performance/package-artifact.ts`
- Create: `apps/desktop/scripts/performance/package-artifact.test.ts`
- Modify: `apps/desktop/package.json`

**Source AC:** `AC-9`

**Design anchors:** `D-011`

**Test cases:** `TC-7`

**Support lenses:** `architecture-designer` for package boundary; `lancet` for the narrowest exclusion predicate.

**Review focus:**

- The ignore predicate matches `/resources/rsshub` and descendants regardless of local directory existence, and does not broaden to all `resources`.
- The actual package/make resources tree is discovered from build output; missing artifact root is a test error, not a skipped/pass result.
- Guard simultaneously proves RSSHub absence and required `resources/app-update.yml`, packaged application files, and necessary module/native resources presence.
- No local source directory is deleted.

**Expected execution evidence:**

- Predicate and fake-tree tests pass for exact root/descendant/near-miss paths and missing-root failure.
- Fresh unsigned Forge build exits successfully.
- Real artifact inspection records resolved artifact root, `rsshubPaths: []`, and every required path `true`.
- A real filesystem negative assertion confirms no packaged RSSHub path.

**TDD steps:**

- [ ] Extend ignore tests so `/resources/rsshub`, descendants, Windows-normalized separators, and near misses fail/pass correctly even without a local fixture directory.
- [ ] Add fake packaged-tree tests for absent RSSHub, accidental RSSHub presence, missing required resources, and nonexistent artifact root.
- [ ] Implement the narrow predicate and real artifact locator/inspection; keep Forge wired to the single shared predicate.
- [ ] Run:

  ```bash
  node --test \
    apps/desktop/scripts/forge-ignore.test.ts \
    apps/desktop/scripts/packaging/rsshub-removed.test.ts \
    apps/desktop/scripts/performance/package-artifact.test.ts
  ```

  Expected: all predicate/tree tests pass without depending on a local `resources/rsshub` directory.

- [ ] Build a real unsigned artifact:

  ```bash
  pnpm --filter suhui build:electron:unsigned
  ```

  Expected: Forge package/make succeeds and produces an artifact under its reported output location.

- [ ] Run the artifact inspection command against the resolved real output. Expected: no `resources/rsshub`, required app-update/application/module resources present. A missing output or missing required resource exits non-zero.

## Plan-Level Verification

- [ ] Run all focused tests from T-001 through T-004 with fresh output.
- [ ] Run:

  ```bash
  node --test \
    apps/desktop/scripts/performance/*.test.ts \
    apps/desktop/scripts/forge-ignore.test.ts \
    apps/desktop/scripts/packaging/rsshub-removed.test.ts
  pnpm --filter @suhui/web typecheck
  pnpm --filter @suhui/store typecheck
  pnpm --filter @suhui/electron-main typecheck
  pnpm --filter suhui build:electron-vite
  pnpm --filter suhui build:electron:unsigned
  ```

  Expected: performance/packaging tests, web/store typechecks, production build, and unsigned artifact build pass. Main typecheck must be reported accurately as pass or fresh blocked baseline evidence.

- [ ] Generate both fixtures and execute every Desktop/Remote cold/warm group with at least 20 successful samples. Report P50/P95/max, machine/OS/arch, commit, production build mode, seed, failures, and raw-sample path.
- [ ] Confirm P95 gates independently for normal/stress and cold/warm: Desktop shell `<=1200`, DB-to-interactive `<=500`, feed/unread usable `<=300`, Remote shell `<=800`, Remote data ready `<=1500` ms. Any failure blocks completion.
- [ ] Confirm refresh 1/10/50 evidence, Remote delayed/failed dependency evidence, list payload bytes/body-field absence, bundle sizes/chunks, sidebar render counts, and all D-013 metrics are present and sanitized.
- [ ] Capture generated SQL plus `EXPLAIN (ANALYZE, BUFFERS)` for representative queries on both fixtures. Missing evidence is `unverified`; index/schema necessity triggers D-014 stop and return to `clarify/spec`.
- [ ] Inspect the actual unsigned packaged tree: RSSHub absent and required resources present. Do not use only a fake tree or hard-coded missing path.
- [ ] Run caller-proof/negative assertions and package-wide guards from `00-overview.md`; verify no deprecated unbounded path, body list projection, migration/schema/config-precedence change, or modification to `.gitignore`/`.vscode/settings.json`.
- [ ] Record all evidence in the shared YAML shape with command, cwd, timestamp, exit code, scope, result, output summary, skipped checks, and environment constraints.
- [ ] Run plan-level `final-review`; update package state for plan 06. Only after clean review, create one child-plan implementation commit. Do not stage or commit per task.
- [ ] Run one package/spec-level `final-review` against `docs/loopx/design/2026-07-13-suhui-performance-refactor/需求设计文档.md` and the complete implementation range. Only a clean result may proceed to `finish`.

## Execution Handoff

Package execution remains:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md
```

Direct child execution for controlled resume only:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/06-performance-and-packaging-gates.md
```

Hard stop: if application refactoring is complete but the production fixtures still miss targets and SQL/EXPLAIN evidence indicates an index/schema change is required, set the gate to `stop_return_to_spec`, preserve evidence, and return to `clarify/spec`. Do not edit database design, continue packaging completion claims, or enter `finish`.
