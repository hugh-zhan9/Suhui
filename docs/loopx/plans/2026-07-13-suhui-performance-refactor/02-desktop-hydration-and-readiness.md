# Desktop Bounded Hydration And Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-13-suhui-performance-refactor/需求设计文档.md`

**Goal:** Remove full-entry Desktop startup hydration, keep the startup snapshot and initial route window bounded to 100 summaries, and expose route/list readiness without changing the existing `interactive` definition.

**Architecture:** Metadata hydration remains the critical DB-backed prerequisite for resolving the current route, while entries are restored from a bounded summary snapshot and then calibrated through the page query delivered by child plan 01. Startup readiness keeps `interactive = shellReady && dbUsable && snapshotRestoreSettled`; route scope and initial entry-page success are separate monotonic signals and metrics, and deep links fetch detail independently.

**Tech Stack:** TypeScript, React, Electron renderer startup, React Query, Zustand-style normalized store, localStorage snapshot, Vitest, pnpm.

**Support lenses:** `architecture-designer`, `sql-style`

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

---

## Dependency And Commit Boundary

- This child plan depends on reviewed completion of `01-entry-query-and-transports.md`.
- Required incoming interfaces are `EntrySummaryPage`, `recordKind`, `entryActions.upsertSummaries`, `entryActions.upsertDetails`, explicit detail-loaded state, and Desktop `useEntriesByView` backed by the paged query.
- Tasks do not stage or commit. After all tasks and plan-level review pass, create exactly one implementation commit for this child plan.
- If the bounded route query cannot preserve the current timeline/deep-link behavior without changing state ownership or adding a database index/schema change, stop and return to `spec` under D-014.

## File Structure

| Path                                                                                  | Action | Responsibility                                                                                                                 |
| ------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `packages/internal/store/src/hydrate.ts`                                              | Modify | Keep only feed/subscription/user/unread metadata in critical hydration; entries are no longer a critical hydrator.             |
| `packages/internal/store/src/hydrate.test.ts`                                         | Modify | Characterize critical order, deferred behavior, dirty writes, and absence of entry DB hydration.                               |
| `packages/internal/store/src/modules/entry/store.ts`                                  | Modify | Remove `Hydratable` entry behavior and make startup snapshot restore preserve current dirty/detail entries.                    |
| `packages/internal/database/src/services/entry.ts`                                    | Modify | Remove the now-dead unbounded `getEntriesToHydrate()` production surface.                                                      |
| `packages/internal/database/src/services/entry.test.ts`                               | Modify | Remove obsolete unbounded hydration tests while preserving entry persistence/query tests.                                      |
| `apps/desktop/layer/renderer/src/initialize/startup-snapshot.ts`                      | Modify | Bump snapshot contract, cap summaries at 100, restore as summaries, and retain current dirty/detail entries.                   |
| `apps/desktop/layer/renderer/src/initialize/startup-snapshot.test.ts`                 | Modify | Prove version invalidation, 100-row cap, summary-only payload, corrupt/miss behavior, and dirty/detail reconciliation.         |
| `apps/desktop/layer/renderer/src/atoms/app.ts`                                        | Modify | Add separate monotonic route-scope and initial-entry readiness fields without changing `interactive`.                          |
| `apps/desktop/layer/renderer/src/initialize/startup-metrics.ts`                       | Modify | Add `route_scope_ready_ms`, `desktop_initial_entries_ready_ms`, and startup entry-row count recording.                         |
| `apps/desktop/layer/renderer/src/initialize/startup-metrics.test.ts`                  | Create | Prove first-write-wins metrics, count logging, reset, and no error-as-ready recording.                                         |
| `apps/desktop/layer/renderer/src/initialize/readiness.ts`                             | Modify | Add route/list readiness transitions while preserving the existing interactive predicate exactly.                              |
| `apps/desktop/layer/renderer/src/initialize/readiness.test.ts`                        | Modify | Prove readiness independence, ordering, idempotence, and error exclusion.                                                      |
| `apps/desktop/layer/renderer/src/initialize/index.ts`                                 | Modify | Mark route scope after successful critical metadata hydration; never wait for initial entries before interactive.              |
| `packages/internal/store/src/modules/entry/types.ts`                                  | Modify | Add an explicit query `enabled` setting used by the Desktop metadata gate.                                                     |
| `packages/internal/store/src/modules/entry/hooks.ts`                                  | Modify | Forward the explicit `enabled` setting to the paged React Query without changing page ownership.                               |
| `apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.ts`      | Modify | Enable the Desktop page query only when its route scope is resolvable; mark first successful/empty initial page and row count. |
| `apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.test.ts` | Modify | Prove metadata gating, successful/empty readiness, errors not ready, route changes, and deep-link detail independence.         |

## Interfaces

The existing interactive contract must remain byte-for-byte equivalent in behavior:

```ts
interactive = shellReady && dbUsable && snapshotRestoreSettled
```

Extend renderer readiness with separate fields:

```ts
type StartupReadinessState = {
  shellReady: boolean
  dbUsable: boolean
  snapshotRestoreSettled: boolean
  interactive: boolean
  routeScopeReady: boolean
  desktopInitialEntriesReady: boolean
  hydrateCriticalDone: boolean
  ready: boolean
  startupSessionId: string | null
}

export const markRouteScopeReady: () => void
export const markDesktopInitialEntriesReady: (entryRows: number) => void
```

`markDesktopInitialEntriesReady` may be called only after a successful first page or a successful confirmed empty page. Query error, request start, skeleton visibility, and stale snapshot display do not call it.

The snapshot contract becomes:

```ts
export const STARTUP_SNAPSHOT_VERSION = 2
export const STARTUP_SNAPSHOT_ENTRY_LIMIT = 100

type StartupSnapshotEntrySummaryRow = {
  id: string
  feedId: string | null
  inboxHandle: string | null
  title: string | null
  summary: string | null
  publishedAt: number
  insertedAt: number
  read: boolean
  sources: string[]
  author: string | null
  recordKind: "summary"
}
```

The startup entry invariant after snapshot restore plus first route calibration is:

```text
at most 100 startup summaries + any detail entries explicitly opened by the user + entries carrying protected dirty user writes
```

No startup code calls `EntryService.getEntriesToHydrate()` or any replacement that reads all persisted entries.

## Surface Inventory And Removal Proof

| Surface                              | Current behavior                                             | Required result                                                                  |
| ------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `criticalHydrates` entry member      | Calls `entryActions.hydrate()` in startup sequence.          | Removed; metadata critical order is feed, subscription, user, unread.            |
| `entryActions.hydrate()`             | Calls unbounded `EntryService.getEntriesToHydrate()`.        | Removed; entry store is populated by snapshot summaries and page/detail queries. |
| `EntryService.getEntriesToHydrate()` | Reads all non-deleted rows then JS-filters active relations. | Removed as dead production API.                                                  |
| startup snapshot                     | Version 1; up to 200 summaries.                              | Version 2; up to 100 summary rows.                                               |
| `interactive`                        | shell + DB + snapshot settled.                               | Exactly unchanged.                                                               |
| initial-list readiness               | Implicit in hydrate/ready phases.                            | Separate successful/empty page signal and metric.                                |
| deep link                            | Often relies on hydrated membership/full row.                | Independent Desktop detail query; no membership prerequisite.                    |

Current-source caller proof before editing:

```bash
rg -n 'getEntriesToHydrate|entryActions\.hydrate|criticalHydrates|restoreHydratedSnapshotInSession' \
  packages/internal/database/src packages/internal/store/src apps/desktop/layer/renderer/src
rg -n 'interactive|shellReady|dbUsable|snapshotRestoreSettled|hydrateCriticalDone' \
  apps/desktop/layer/renderer/src/atoms/app.ts \
  apps/desktop/layer/renderer/src/initialize \
  apps/desktop/layer/renderer/src/App.tsx
```

Historical paths under `docs/`, `.loopx/`, changelogs, and release notes are excluded from caller proof. Required negative assertions after the change:

```bash
test "$(rg -n 'getEntriesToHydrate|entryActions\.hydrate\(' packages/internal/database/src packages/internal/store/src apps/desktop/layer/renderer/src | wc -l | tr -d ' ')" = "0"
test "$(rg -n 'slice\(0, 200\)|STARTUP_SNAPSHOT_VERSION = 1' apps/desktop/layer/renderer/src/initialize | wc -l | tr -d ' ')" = "0"
rg -n 'STARTUP_SNAPSHOT_ENTRY_LIMIT = 100|route_scope_ready_ms|desktop_initial_entries_ready_ms' \
  apps/desktop/layer/renderer/src/initialize
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*' '.gitignore' '.vscode/settings.json'
```

Expected: removed startup/unbounded surfaces have zero current production references; old snapshot cap/version text is absent; new bounded constants/metrics have current callers; no migration/schema or protected worktree file changed.

### T-001 / Task 1: Remove Full-Entry Critical Hydration And Its Dead Database Surface

**Files:**

- Modify: `packages/internal/store/src/hydrate.ts`
- Modify: `packages/internal/store/src/hydrate.test.ts`
- Modify: `packages/internal/store/src/modules/entry/store.ts`
- Modify: `packages/internal/database/src/services/entry.ts`
- Modify: `packages/internal/database/src/services/entry.test.ts`

**Interfaces:**

- Consumes: existing feed/subscription/user/unread `Hydratable` implementations and child-plan-01 page/detail population APIs.
- Produces: critical metadata order `feed -> subscription -> user -> unread`; no `entryActions.hydrate`; no `EntryService.getEntriesToHydrate`.

**Traceability:**

- Source AC: `AC-3`
- Design anchors: `D-006`, `D-014`; supports the no-body portion of `D-003`/`D-005` without changing their interfaces.
- Test cases: `TC-3`; production scale portion is completed in child plan 06 under `TC-6`.
- Task anchor: `T-001`

**Expected execution evidence:**

- `commands_run`: focused store/database Vitest commands, zero-caller search, store/database typechecks, database diff guard.
- `evidence_summary`: critical hydration completes without any entry-table list read; metadata ordering and deferred hydration remain correct; user-write reconciliation tests remain green.
- `remaining_risk`: startup snapshot/route calibration bounds are closed by T-002/T-003.

**Review focus:**

- Verify removing entry hydration does not move another all-entry read into critical or deferred hydration.
- Verify metadata required for scope resolution remains available and current hydrate phase transitions still occur.
- Verify dirty read-state protection remains in the projection-aware merge path from child plan 01.
- Verify the removed database method has no current source caller and is not kept for historical-test compatibility.
- Verify no schema/index/migration/config-precedence change.

**Support lenses:** `architecture-designer`, `sql-style`

- [ ] **Step 1: Rewrite hydration tests to fail if any entry hydration occurs**

Replace the old order expectation with:

```ts
it("hydrates only route metadata in the critical barrier", async () => {
  const order: string[] = []
  vi.spyOn(feedActions, "hydrate").mockImplementation(async () => {
    order.push("feed")
  })
  vi.spyOn(subscriptionActions, "hydrate").mockImplementation(async () => {
    order.push("subscription")
  })
  vi.spyOn(userActions, "hydrate").mockImplementation(async () => {
    order.push("user")
  })
  vi.spyOn(unreadActions, "hydrate").mockImplementation(async () => {
    order.push("unread")
  })

  await hydrateCriticalToStore()

  expect(order).toEqual(["feed", "subscription", "user", "unread"])
})
```

Add a source/API test asserting `"getEntriesToHydrate" in EntryService` is false after removal, and update the dirty-write test to exercise `entryActions.upsertSummaries` rather than calling the removed hydrate method.

- [ ] **Step 2: Run focused tests and confirm the current all-entry path makes them fail**

Run:

```bash
pnpm --filter @suhui/store exec vitest run src/hydrate.test.ts
pnpm --filter @suhui/database exec vitest run src/services/entry.test.ts
```

Expected: FAIL because entry is still in `criticalHydrates` and the unbounded database method still exists.

- [ ] **Step 3: Remove entry from critical hydration and remove `EntryActions` hydration behavior**

Set the critical list exactly to:

```ts
const criticalHydrates: Hydratable[] = [
  feedActions,
  subscriptionActions,
  userActions,
  unreadActions,
]
```

Delete `EntryActions implements Hydratable`, its `hydrate()` method, and the now-unused `Hydratable` import in `store.ts`. Do not add `entryActions` to `deferredHydrates`; initial entries must arrive only from snapshot/page/detail paths.

- [ ] **Step 4: Remove `EntryService.getEntriesToHydrate()` and obsolete tests**

Delete the method and the imports used only by it (`getActiveVisibilityState`, `isEntryVisibleForActiveRelations`). Remove its two full-table behavior tests. Preserve `getEntryMany`, `getEntryAll`, write/reset behavior, and JSON sanitation tests because they serve non-startup callers.

- [ ] **Step 5: Preserve dirty user writes through summary calibration**

Update the hydration dirty-write test so the sequence is: metadata snapshot/user edits, `startHydrateInteractive()`, a user `markEntryReadStatusInSession`, then a late `upsertSummaries` result with `read: false`. The final entry read value must remain `true`, using the child-plan-01 dirty reconciliation contract rather than an all-entry hydrate.

- [ ] **Step 6: Run focused tests, typechecks, and removal guards**

Run:

```bash
pnpm --filter @suhui/store exec vitest run src/hydrate.test.ts src/modules/entry/store.projection.test.ts
pnpm --filter @suhui/database exec vitest run src/services/entry.test.ts
pnpm --filter @suhui/store typecheck
pnpm --filter @suhui/database typecheck
test "$(rg -n 'getEntriesToHydrate|entryActions\.hydrate\(' packages/internal/database/src packages/internal/store/src apps/desktop/layer/renderer/src | wc -l | tr -d ' ')" = "0"
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*'
```

Expected: tests and typechecks PASS; zero-caller assertion exits 0; schema/migration diff prints nothing.

- [ ] **Step 7: Record task evidence**

```yaml
task_anchor: T-001
source_ac: [AC-3]
design_anchors: [D-003, D-005, D-006, D-014]
test_cases: [TC-3]
commands_run:
  - focused @suhui/store and @suhui/database Vitest suites: PASS
  - @suhui/store and @suhui/database typecheck: PASS
  - getEntriesToHydrate/entryActions.hydrate negative assertion: clean
  - migration/schema guard: clean
evidence_summary: startup critical hydration contains metadata only and no production API remains that loads every entry for hydration
remaining_risk: bounded snapshot and successful first-page readiness remain for T-002 and T-003
```

### T-002 / Task 2: Version And Bound The Startup Snapshot To 100 Summaries

**Files:**

- Modify: `apps/desktop/layer/renderer/src/initialize/startup-snapshot.ts`
- Modify: `apps/desktop/layer/renderer/src/initialize/startup-snapshot.test.ts`
- Modify: `packages/internal/store/src/modules/entry/store.ts`
- Modify: `packages/internal/store/src/modules/entry/store.projection.test.ts`

**Interfaces:**

- Consumes: child-plan-01 summary/detail merge APIs, existing snapshot identity/reset/lifecycle hooks, current route params, and dirty hydrate-phase reconciliation.
- Produces: `STARTUP_SNAPSHOT_VERSION = 2`, `STARTUP_SNAPSHOT_ENTRY_LIMIT = 100`, summary-only snapshot rows, and restore semantics that preserve current dirty/detail entries.

**Traceability:**

- Source AC: `AC-3`
- Design anchors: `D-003`, `D-005`, `D-006`, `D-014`
- Test cases: `TC-3`; snapshot cold/warm behavior contributes to `TC-6` in child plan 06.
- Task anchor: `T-002`

**Expected execution evidence:**

- `commands_run`: startup snapshot and projection merge Vitest commands, renderer/store typechecks, old-version/cap negative assertions.
- `evidence_summary`: a 150-entry current route persists exactly 100 summary rows; no body field is serialized; v1/corrupt/miss states do not block startup; restore does not erase a user-opened detail or dirty read.
- `remaining_risk`: production cold/warm timing and stored payload bytes remain child-plan-06 evidence.

**Review focus:**

- Verify the cap is applied before serialization and cannot be bypassed by feed/inbox/view route selection.
- Verify snapshot rows never include body fields or mark detail loaded.
- Verify an older version is discarded, not partially migrated into the new page contract.
- Verify restore retains current detail/dirty entries while constraining snapshot-origin summaries to 100.
- Verify snapshot miss/corrupt/old version leads to a bounded first page rather than an all-entry fallback.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Add failing snapshot contract and reconciliation tests**

Add cases:

```ts
it("persists at most 100 summary rows without body fields", async () => {
  seedRouteEntries(150, { content: "body", readabilityContent: "readable" })
  await markStartupSnapshotInteractive()
  const payload = readPersistedSnapshot()
  expect(payload.version).toBe(2)
  expect(payload.entries).toHaveLength(100)
  expect(payload.entries.every((entry) => entry.recordKind === "summary")).toBe(true)
  expect(payload.entries[0]).not.toHaveProperty("content")
  expect(payload.entries[0]).not.toHaveProperty("readabilityContent")
  expect(payload.entries[0]).not.toHaveProperty("readabilityUpdatedAt")
})

it("restores summaries without erasing an opened detail or dirty read", async () => {
  entryActions.upsertDetails([{ ...detail, id: "opened", content: "body", recordKind: "detail" }])
  entryActions.markEntryReadStatusInSession({ entryIds: ["dirty"], read: true })
  writeSnapshot({ entries: [summary("dirty", false), summary("snapshot-only", false)] })
  await restoreStartupSnapshot()
  expect(getEntry("opened")?.content).toBe("body")
  expect(entryActions.isDetailLoaded("opened")).toBe(true)
  expect(getEntry("dirty")?.read).toBe(true)
})
```

Keep valid hit, no storage, missing, malformed, old version, identity isolation, debounce, pagehide, visibility, Electron close, reset, and user-change tests.

- [ ] **Step 2: Run snapshot tests and confirm the v1/200-row behavior is red**

Run:

```bash
pnpm --filter @suhui/web exec vitest run src/initialize/startup-snapshot.test.ts
pnpm --filter @suhui/store exec vitest run src/modules/entry/store.projection.test.ts
```

Expected: FAIL because version is 1, cap is 200, and restore currently replaces the entire entry data map.

- [ ] **Step 3: Bump the snapshot contract and enforce the summary cap**

Define:

```ts
export const STARTUP_SNAPSHOT_VERSION = 2
export const STARTUP_SNAPSHOT_ENTRY_LIMIT = 100
```

Use `.slice(0, STARTUP_SNAPSHOT_ENTRY_LIMIT)` and include `recordKind: "summary"` in each serialized entry. Keep the existing summary field allowlist only. Do not serialize `content`, `readabilityContent`, `readabilityUpdatedAt`, `extra`, or `settings`.

- [ ] **Step 4: Restore snapshot entries through summary-aware reconciliation**

Replace destructive whole-map restoration for startup summaries with a dedicated method such as:

```ts
restoreStartupSummariesInSession(entries: EntryModel[]) {
  const incoming = entries.slice(0, STARTUP_SNAPSHOT_ENTRY_LIMIT)
  this.removeUnprotectedPriorSnapshotSummaries(incoming.map(({ id }) => id))
  this.upsertSummaries(incoming)
  this.replaceStartupSnapshotEntryIds(incoming.map(({ id }) => id))
}
```

Track snapshot-origin IDs separately from query-page membership. Removal may affect only prior snapshot-origin summary-only entries absent from the incoming snapshot; it must retain entries that are detail-loaded, belong to a current query page, or are protected by current hydrate dirty state. Rebuild legacy indexes only as compatibility indexes; they must not become page membership ownership again.

- [ ] **Step 5: Preserve old/corrupt/miss behavior without fallback**

`restoreStartupSnapshot()` keeps returning `old_version`, `corrupt`, `miss`, or `skipped` and marks snapshot restore settled through the existing caller. It must not invoke an entry database service, synthesize an unbounded list, or mark initial entries ready. T-003's paged query handles calibration.

- [ ] **Step 6: Run focused tests, typechecks, and snapshot negative assertions**

Run:

```bash
pnpm --filter @suhui/web exec vitest run src/initialize/startup-snapshot.test.ts
pnpm --filter @suhui/store exec vitest run src/modules/entry/store.projection.test.ts
pnpm --filter @suhui/web typecheck
pnpm --filter @suhui/store typecheck
test "$(rg -n 'slice\(0, 200\)|STARTUP_SNAPSHOT_VERSION = 1' apps/desktop/layer/renderer/src/initialize | wc -l | tr -d ' ')" = "0"
rg -n 'STARTUP_SNAPSHOT_VERSION = 2|STARTUP_SNAPSHOT_ENTRY_LIMIT = 100' \
  apps/desktop/layer/renderer/src/initialize/startup-snapshot.ts
```

Expected: tests/typechecks PASS; old-version/cap assertion exits 0; new constants appear exactly in the snapshot implementation.

- [ ] **Step 7: Record task evidence**

```yaml
task_anchor: T-002
source_ac: [AC-3]
design_anchors: [D-003, D-005, D-006, D-014]
test_cases: [TC-3]
commands_run:
  - @suhui/web startup-snapshot Vitest: PASS
  - @suhui/store projection Vitest: PASS
  - @suhui/web and @suhui/store typecheck: PASS
  - old snapshot version/200-row cap negative assertion: clean
evidence_summary: startup persistence is versioned, summary-only, capped at 100, and reconciles without erasing opened detail or dirty user state
remaining_risk: production snapshot size and cold/warm performance are deferred to child plan 06
```

### T-003 / Task 3: Separate Route And Initial-Page Readiness From Interactive

**Files:**

- Modify: `apps/desktop/layer/renderer/src/atoms/app.ts`
- Modify: `apps/desktop/layer/renderer/src/initialize/startup-metrics.ts`
- Create: `apps/desktop/layer/renderer/src/initialize/startup-metrics.test.ts`
- Modify: `apps/desktop/layer/renderer/src/initialize/readiness.ts`
- Modify: `apps/desktop/layer/renderer/src/initialize/readiness.test.ts`
- Modify: `apps/desktop/layer/renderer/src/initialize/index.ts`
- Modify: `packages/internal/store/src/modules/entry/types.ts`
- Modify: `packages/internal/store/src/modules/entry/hooks.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.test.ts`

**Interfaces:**

- Consumes: metadata-only `hydrateCriticalToStore`, existing shell/DB/snapshot readiness, child-plan-01 paged `useEntriesByView`, and explicit detail fetch for deep links.
- Produces: `routeScopeReady`, `desktopInitialEntriesReady`, `markRouteScopeReady()`, `markDesktopInitialEntriesReady(entryRows)`, `route_scope_ready_ms`, `desktop_initial_entries_ready_ms`, and `desktop_startup_entry_rows`.

**Traceability:**

- Source AC: `AC-3`, `AC-6`
- Design anchors: `D-006`, `D-013`, `D-014`
- Test cases: `TC-3`; Desktop threshold and error-exclusion portions of `TC-6` are completed in child plan 06.
- Task anchor: `T-003`

**Expected execution evidence:**

- `commands_run`: readiness/metrics/route-hook Vitest commands; renderer/store typechecks; exact interactive predicate source assertion; error-does-not-ready tests.
- `evidence_summary`: interactive can occur before metadata/list; route scope follows successful metadata; only a successful/empty first page records Desktop initial readiness and row count; deep-link detail does not depend on startup membership.
- `remaining_risk`: production P95 and renderer commit timestamps require child plan 06 harness evidence.

**Review focus:**

- Verify the interactive predicate remains exactly shell + DB + snapshot settled and does not gain metadata, route, query, or hydration conditions.
- Verify route/list readiness fields are monotonic and reset per startup session.
- Verify errors and request start do not record `desktop_initial_entries_ready_ms`.
- Verify the Desktop route query is gated only until metadata makes its scope reliable; snapshot shell and interactive remain independent.
- Verify a deep-link detail fetch is issued even when the entry is outside the startup page/window.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Write failing readiness, metric, and route-query tests**

Extend readiness tests:

```ts
it("keeps interactive independent from metadata and initial entries", () => {
  beginStartupSession("session")
  markShellReady()
  markDbUsable()
  markSnapshotRestoreSettled()
  expect(getStartupReadiness()).toMatchObject({
    interactive: true,
    routeScopeReady: false,
    desktopInitialEntriesReady: false,
  })
})

it("records route and initial-page readiness once", () => {
  markRouteScopeReady()
  markRouteScopeReady()
  markDesktopInitialEntriesReady(20)
  markDesktopInitialEntriesReady(0)
  expect(getStartupReadiness()).toMatchObject({
    routeScopeReady: true,
    desktopInitialEntriesReady: true,
  })
  expect(getStartupMetricsForTests().has("route_scope_ready_ms")).toBe(true)
  expect(getStartupMetricsForTests().has("desktop_initial_entries_ready_ms")).toBe(true)
  expect(getStartupCountMetricsForTests().get("desktop_startup_entry_rows")).toBe(20)
})
```

Route-hook tests must simulate: metadata pending means no list request; metadata success issues one page request; page success with 20 rows marks ready; successful empty page marks ready with 0; page error leaves ready false and exposes the existing retry state; deep-link detail request is independent of list membership.

- [ ] **Step 2: Run focused tests and confirm the new independent states are missing**

Run:

```bash
pnpm --filter @suhui/web exec vitest run \
  src/initialize/readiness.test.ts \
  src/initialize/startup-metrics.test.ts \
  src/modules/entry-column/hooks/useEntriesByView.test.ts
```

Expected: FAIL because route/list readiness fields, metrics, and metadata query gating do not exist.

- [ ] **Step 3: Extend readiness state without changing interactive promotion**

Add `routeScopeReady` and `desktopInitialEntriesReady`, both initialized false and merged monotonically. Keep `maybePromoteInteractive` condition exactly:

```ts
if (!(state.shellReady && state.dbUsable && state.snapshotRestoreSettled)) {
  return false
}
```

Implement `markRouteScopeReady()` and `markDesktopInitialEntriesReady(entryRows)` as idempotent transitions. Neither function calls `setAppIsReady`, `startHydrateInteractive`, `markReady`, or changes the interactive predicate.

- [ ] **Step 4: Add first-write-wins metrics and safe row counts**

Extend duration metric names with `route_scope_ready_ms` and `desktop_initial_entries_ready_ms`. Add a separate count recorder for `desktop_startup_entry_rows` that accepts only a finite non-negative integer, records once per startup session, and logs no titles, body, URLs, SQL, connection strings, or local paths.

Reset both duration and count maps in `resetStartupMetricsForTests()`.

- [ ] **Step 5: Mark route scope after metadata hydrate and gate only the page query**

In `initializeApp`, after `hydrateCriticalToStore({migrateDatabase:true})` fulfills, call `markRouteScopeReady()` before the existing later-phase `markHydrateCriticalDone()`. Do not await a route page in `initializeApp`, and do not add it to `Promise.allSettled` prerequisites for interactive or ready.

Add `enabled?: boolean` to `FetchEntriesPropsSettings`, destructure it in `useEntriesQuery`, and set React Query `enabled: enabled !== false && !!props`. In `useEntriesByView`, pass `enabled: routeScopeReady` for Desktop. Remote behavior remains governed by child plan 04 and must not use this Desktop startup gate. When the first page reaches query success, including an explicit empty `data` page, call `markDesktopInitialEntriesReady(firstPage.data.length)` once. When query state is error, do not call it.

- [ ] **Step 6: Preserve deep-link detail independence**

Add/retain an effect or existing content hook that calls `fetchEntryDetail(entryId)` whenever the selected deep-link entry is not explicitly detail-loaded. It must not require the ID to exist in `entriesIds`, the snapshot, or the first route page. Tests must cover a deep-link ID absent from all startup summaries.

- [ ] **Step 7: Run focused tests, typechecks, and predicate/DB guards**

Run:

```bash
pnpm --filter @suhui/web exec vitest run \
  src/initialize/readiness.test.ts \
  src/initialize/startup-metrics.test.ts \
  src/initialize/startup-snapshot.test.ts \
  src/modules/entry-column/hooks/useEntriesByView.test.ts
pnpm --filter @suhui/store exec vitest run src/hydrate.test.ts src/modules/entry/store.projection.test.ts
pnpm --filter @suhui/web typecheck
pnpm --filter @suhui/store typecheck
rg -n 'state\.shellReady && state\.dbUsable && state\.snapshotRestoreSettled' \
  apps/desktop/layer/renderer/src/initialize/readiness.ts
test "$(rg -n 'getEntriesToHydrate|entryActions\.hydrate\(' packages/internal/database/src packages/internal/store/src apps/desktop/layer/renderer/src | wc -l | tr -d ' ')" = "0"
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*' '.gitignore' '.vscode/settings.json'
```

Expected: focused tests/typechecks PASS; the exact three-term interactive predicate is present; removed hydration callers remain zero; no migration/schema/protected worktree file appears.

- [ ] **Step 8: Record task evidence**

```yaml
task_anchor: T-003
source_ac: [AC-3, AC-6]
design_anchors: [D-006, D-013, D-014]
test_cases: [TC-3, TC-6]
commands_run:
  - focused @suhui/web readiness/metrics/snapshot/route Vitest: PASS
  - focused @suhui/store hydrate/projection Vitest: PASS
  - @suhui/web and @suhui/store typecheck: PASS
  - exact interactive predicate and removed-hydration negative assertions: clean
  - migration/schema/protected-worktree guard: clean
evidence_summary: Desktop startup independently records shell/interactive, metadata route scope, and successful first page while errors do not count and deep links remain detail-driven
remaining_risk: production cold/warm P95, commit timing, payload, and SQL evidence remain for child plan 06
```

## Plan-Level Verification

Run after all three tasks:

```bash
pnpm --filter @suhui/database exec vitest run src/services/entry.test.ts
pnpm --filter @suhui/store exec vitest run \
  src/hydrate.test.ts \
  src/modules/entry/store.projection.test.ts
pnpm --filter @suhui/web exec vitest run \
  src/initialize/readiness.test.ts \
  src/initialize/startup-metrics.test.ts \
  src/initialize/startup-snapshot.test.ts \
  src/modules/entry-column/hooks/useEntriesByView.test.ts
pnpm --filter @suhui/database typecheck
pnpm --filter @suhui/store typecheck
pnpm --filter @suhui/web typecheck
pnpm --filter suhui build:electron-vite
test "$(rg -n 'getEntriesToHydrate|entryActions\.hydrate\(|slice\(0, 200\)|STARTUP_SNAPSHOT_VERSION = 1' packages/internal/database/src packages/internal/store/src apps/desktop/layer/renderer/src | wc -l | tr -d ' ')" = "0"
rg -n 'STARTUP_SNAPSHOT_ENTRY_LIMIT = 100|route_scope_ready_ms|desktop_initial_entries_ready_ms|desktop_startup_entry_rows' \
  apps/desktop/layer/renderer/src
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*' '.gitignore' '.vscode/settings.json'
```

Expected: focused tests, typechecks, and production build pass; removed full-entry startup paths and old snapshot contract are absent; the 100-row cap and new metrics have current callers; no DB design or protected worktree file changed.

Manual/runtime evidence:

1. Start with the normal fixture and record a run where `interactive_ms` occurs without waiting for metadata/list, followed by `route_scope_ready_ms` and a successful/empty `desktop_initial_entries_ready_ms`.
2. Inspect the persisted snapshot and record exactly 100 or fewer entry rows, every row `recordKind="summary"`, with no body fields.
3. Delay the first page: the snapshot/skeleton remains visible and interactive stays defined by shell/DB/snapshot only.
4. Fail the first page: an error/retry state appears, and no initial-entry-ready metric is emitted.
5. Open a deep-link entry outside the 100-row window and confirm Desktop detail loads through `desktop-non-deleted` without first expanding the list.
6. Mark an entry read while snapshot/page reconciliation is in flight and confirm the final state remains read.

## Execution Handoff

Use package mode from the overview for normal execution:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md
```

Direct child execution is only for targeted/resume/manual-control work after child plan 01 is reviewed:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/02-desktop-hydration-and-readiness.md
$exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/02-desktop-hydration-and-readiness.md
```

After task evidence is complete, run plan-level `final-review`, update `.loopx/multi-plan/suhui-performance-refactor/state.json` fields `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review`, then create one implementation commit for this reviewed child plan. Do not stage or commit per task.
