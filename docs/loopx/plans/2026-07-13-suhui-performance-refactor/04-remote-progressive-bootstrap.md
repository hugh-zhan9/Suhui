# Remote Progressive Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-13-suhui-performance-refactor/需求设计文档.md`

**Goal:** Mount a stable Remote reader shell before network work, hydrate metadata atomically from `/api/bootstrap`, load the initial bounded entry page and SSE independently, and expose retryable loading/error/ready states with production-ready timing metrics.

**Architecture:** The Remote React root renders synchronously, then a post-mount query requests one atomic metadata envelope and applies it without awaits between store writes. Entry pages remain owned by the plan-01 React Query path and become eligible as soon as metadata determines the active scope; SSE connects independently and never gates data-ready. The fallback shell follows the same bootstrap and cursor contracts, while unread counts are aggregated in set-based PostgreSQL queries over the existing schema.

**Tech Stack:** TypeScript, React, React Query, Zustand-style stores, Electron-hosted HTTP/SSE, Drizzle, PostgreSQL, Vitest, pnpm.

**Support lenses:** `api-designer`, `architecture-designer`, `sql-style`

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

- Package dependencies: complete and review `01-entry-query-and-transports.md` and `03-refresh-changesets.md` first. This plan consumes `EntrySummaryPage`, the normalized entry query key, `EntryChangeEventV1`, and `entryChangeInvalidationCoordinator.handleReconnect()`.
- Direct execution dependency: verify `GET /api/entries` already returns bounded `{data,page}` responses and the Remote query hook consumes `page.nextCursor`; this plan must not compensate with client slicing or an unbounded fallback.
- Commit boundary: tasks do not stage or commit. After all tasks, verification, and plan-level `final-review` pass, create one implementation commit for this child plan.

## File Structure

| Path                                                                | Change                                                      | Responsibility                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/layer/main/src/application/unread/service.ts`         | Modify                                                      | Replace full unread-entry row loading with grouped set-based SQL over the existing schema.                                |
| `apps/desktop/layer/main/src/application/unread/service.test.ts`    | Modify                                                      | Prove grouped SQL, `read IS NOT TRUE`, active visibility, and no full-row query.                                          |
| `apps/desktop/layer/main/src/remote/manager.ts`                     | Modify                                                      | Return one complete `/api/bootstrap` metadata envelope and preserve existing Remote boundaries.                           |
| `apps/desktop/layer/main/src/remote/manager.test.ts`                | Modify                                                      | Prove atomic bootstrap shape, single provider call, and no sensitive error leakage.                                       |
| `packages/internal/store/src/remote/bootstrap.ts`                   | Create                                                      | Bootstrap types, synchronous metadata application, status model, reset, and retry-safe loader.                            |
| `packages/internal/store/src/remote/bootstrap.test.ts`              | Create                                                      | Prove no partial publish, reset semantics, and success/error state transitions.                                           |
| `packages/internal/store/src/remote/hydrate.ts`                     | Retain in `T-002`, remove in `T-003` after caller migration | Remove the pre-mount three-request hydration path and its implicit SSE gate without creating a broken intermediate build. |
| `packages/internal/store/src/remote/index.ts`                       | Modify                                                      | Export the bootstrap contract and stop exporting `hydrateFromRemote`/`RemoteHydrateStatus`.                               |
| `packages/internal/store/src/remote/transforms.ts`                  | Modify                                                      | Define/transform the complete bootstrap payload without changing entry projection behavior.                               |
| `packages/internal/store/src/remote/transforms.test.ts`             | Modify                                                      | Prove bootstrap feeds/subscriptions/unread/collections transformation is deterministic.                                   |
| `packages/internal/store/src/runtime/client.ts`                     | Modify                                                      | Add `runtimeClient.bootstrap.get()` for `/api/bootstrap`; retain old endpoint clients for non-bootstrap use.              |
| `packages/internal/store/src/runtime/client.test.ts`                | Modify                                                      | Prove one bootstrap request and exact envelope parsing.                                                                   |
| `apps/desktop/layer/renderer/src/remote/remote-bootstrap.tsx`       | Create                                                      | Post-mount React Query bootstrap, retry UI contract, SSE independence, and atomic store apply.                            |
| `apps/desktop/layer/renderer/src/remote/remote-bootstrap.test.tsx`  | Create                                                      | Delayed/failing bootstrap and entries tests for desktop/mobile layout.                                                    |
| `apps/desktop/layer/renderer/src/remote/remote-performance.ts`      | Create                                                      | One-shot Remote readiness/error metric recording and derived data-ready semantics.                                        |
| `apps/desktop/layer/renderer/src/remote/remote-performance.test.ts` | Create                                                      | Prove successful/empty completion and error exclusion from ready metrics.                                                 |
| `apps/desktop/layer/renderer/src/remote/main.tsx`                   | Modify                                                      | Mount providers and `RemoteApp` before any HTTP bootstrap request.                                                        |
| `apps/desktop/layer/renderer/src/remote/remote-app.tsx`             | Modify                                                      | Render stable shell skeleton/error/retry, independent entries state, and honest SSE status.                               |
| `apps/desktop/layer/renderer/src/remote/remote.css`                 | Modify                                                      | Reserve stable loading/error layout for desktop and mobile viewports.                                                     |
| `apps/desktop/layer/main/src/remote/shell.ts`                       | Modify                                                      | Make the fallback shell use `/api/bootstrap`, explicit retry, and cursor-based `Load more`.                               |
| `apps/desktop/layer/main/src/remote/shell.test.ts`                  | Create                                                      | Prove fallback startup has no separate subscription/unread calls and advances cursors.                                    |

## Surface Inventory

| Surface                    | Current source/caller                                                                                                                                        | Required result                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Remote root mount          | `apps/desktop/layer/renderer/src/remote/main.tsx` calls `await hydrateFromRemote()` before `ReactDOM.createRoot`                                             | `createRoot(...).render(...)` occurs synchronously; first bootstrap request originates from a mounted effect/query.                        |
| `hydrateFromRemote` export | Defined in `packages/internal/store/src/remote/hydrate.ts`; imported only by Remote `main.tsx`; re-exported by `packages/internal/store/src/remote/index.ts` | Migrate current production caller, remove the obsolete export/file, and prove no strict current caller remains.                            |
| `GET /api/bootstrap`       | Route and dependency in `apps/desktop/layer/main/src/remote/manager.ts`; current bootstrap lacks collections and explicit feeds                              | Retain URI/method/`{data}`; one successful envelope contains subscriptions, feeds, unread, collections, settings, capabilities.            |
| Bootstrap client requests  | `packages/internal/store/src/remote/hydrate.ts` calls `/api/subscriptions`, `/api/unread`, `/api/collections` separately                                     | Initial metadata uses one `/api/bootstrap`; old endpoint methods remain available for mutation/reconnect/manual refresh behavior.          |
| Initial entries            | `RemoteDesktopTimeline` calls plan-01 `useEntriesQuery` after subscription-derived scope exists                                                              | Bootstrap and entries expose independent loading/error/retry states; entry failure leaves shell/sidebar mounted.                           |
| SSE                        | `hydrateFromRemote` connects only after all three metadata requests; `RemoteApp` reads a boolean initialized as connected                                    | Connect after mount independently; use the three phases `connecting`, `connected`, and `disconnected`; failure never counts as data ready. |
| Unread counts              | `UnreadApplicationService.listUnreadCounts()` loads every unread row and aggregates in JS                                                                    | PostgreSQL returns grouped counts; JS merges only bounded grouped rows; `read IS NOT TRUE` includes legacy NULL.                           |
| Fallback shell             | `apps/desktop/layer/main/src/remote/shell.ts` starts `/api/subscriptions` + `/api/unread`, and list requests do not consume `page.nextCursor`                | Initial metadata uses `/api/bootstrap`; entries request `limit=20`, persist `nextCursor`, and append only when user selects `Load more`.   |
| Remote auth/bind           | Existing manager/lifecycle/config code                                                                                                                       | No change to host, port, authentication, permission, or public-security claims.                                                            |

### Caller Proof

Run before edits and attach output to task evidence:

```bash
rg -n 'hydrateFromRemote|RemoteHydrateStatus|loadInitialEntries' \
  apps/desktop/layer/renderer/src packages/internal/store/src
rg -n '/api/bootstrap|/api/subscriptions|/api/unread|/api/collections|new EventSource|events\.connect' \
  apps/desktop/layer/main/src/remote \
  apps/desktop/layer/renderer/src/remote \
  packages/internal/store/src/remote \
  packages/internal/store/src/runtime/client.ts
rg -n 'listUnreadCounts|entriesTable\.findMany|unreadTable\.findMany|getActiveVisibilityState' \
  apps/desktop/layer/main/src/application/unread \
  apps/desktop/layer/main/src/remote
```

Expected: the current strict callers match the inventory above. Historical plans/designs/changelogs, generated build output, and dependencies are excluded from compatibility proof.

### Negative Assertions

Run after implementation:

```bash
rg -n 'hydrateFromRemote|RemoteHydrateStatus|loadInitialEntries' \
  apps/desktop/layer/renderer/src packages/internal/store/src
rg -n 'await .*bootstrap|await hydrate|hydrateFromRemote' apps/desktop/layer/renderer/src/remote/main.tsx
rg -n 'fetch\("/api/(subscriptions|unread|collections)"\)' apps/desktop/layer/main/src/remote/shell.ts
rg -n 'entriesTable\.findMany|eq\(entries\.read, false\)' apps/desktop/layer/main/src/application/unread/service.ts
rg -n 'slice\(|sort\(|filter\(' packages/internal/store/src/remote/bootstrap.ts apps/desktop/layer/main/src/remote/shell.ts
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*' '.gitignore' '.vscode/settings.json'
```

Expected: obsolete pre-mount hydration symbols and awaited startup request are absent; fallback bootstrap does not call separate metadata endpoints; unread service performs no full entry-row query and uses `IS NOT TRUE`; bootstrap and fallback do not rebuild pagination with JS slice/sort/filter; no migration/schema/config/user-owned file changes exist.

## Exact Interfaces

```ts
// packages/internal/store/src/remote/bootstrap.ts
export type RemoteBootstrapPayload = {
  subscriptions: SubscriptionRecord[]
  feeds: Array<Partial<FeedModel> & { id: string }>
  unread: UnreadRecord[]
  collections: CollectionRecord[]
  settings: RemoteSettings
  capabilities: unknown
}

export type RemoteBootstrapPhase = "loading" | "ready" | "error"

export type RemoteBootstrapState = {
  phase: RemoteBootstrapPhase
  error: string | null
  subscriptionsLoaded: number
  feedsLoaded: number
  unreadLoaded: number
  collectionsLoaded: number
  settings: RemoteSettings | null
  capabilities: unknown
}

export const applyRemoteBootstrapInSession: (
  payload: RemoteBootstrapPayload,
) => RemoteBootstrapState
export const resetRemoteBootstrapStores: () => void
```

`applyRemoteBootstrapInSession` validates and transforms the full response before touching any store. Once validation succeeds, it performs subscription replacement, feed upsert, unread reset/upsert, collection reset/upsert, and settings/capabilities publication synchronously with no `await` between writes; it publishes phase=`ready` only after every write completes. If validation fails, it publishes no partial metadata and leaves the previous successful snapshot intact.

```ts
// packages/internal/store/src/runtime/client.ts
runtimeClient.bootstrap.get(): Promise<RemoteBootstrapPayload>
```

HTTP stays `GET /api/bootstrap -> {data: RemoteBootstrapPayload}`. `/api/subscriptions`, `/api/unread`, `/api/collections`, `/api/settings`, and `/api/capabilities` remain available; they are not the initial bootstrap path.

```ts
// apps/desktop/layer/renderer/src/remote/remote-bootstrap.tsx
export type RemoteBootstrapViewState = {
  phase: RemoteBootstrapPhase
  error: string | null
  retry(): void
}

export const useRemoteBootstrap: () => RemoteBootstrapViewState
export type RemoteConnectionPhase = "connecting" | "connected" | "disconnected"
```

```ts
// apps/desktop/layer/renderer/src/remote/remote-performance.ts
export type RemoteMetricName =
  | "remote_shell_visible_ms"
  | "remote_bootstrap_ready_ms"
  | "remote_initial_entries_ready_ms"
  | "remote_data_ready_ms"
  | "remote_bootstrap_error_visible_ms"
  | "remote_entries_error_visible_ms"

export const beginRemotePerformanceSession: (startedAt?: number) => void
export const markRemoteMetric: (name: RemoteMetricName, at?: number) => number
export const markRemoteDataReadyIfComplete: (input: {
  bootstrapReady: boolean
  initialEntriesReady: boolean
}) => number | null
```

Every metric is one-shot per navigation and logs only name/value/session ID. `remote_shell_visible_ms` is recorded in a layout effect after the reader root's first visible commit. `remote_bootstrap_ready_ms` requires successful bootstrap application. `remote_initial_entries_ready_ms` requires the first bounded entry query to succeed with rows or a confirmed empty page. `remote_data_ready_ms` is recorded only when both success flags are true. Error panels record their error-visible metric after commit and never record a ready metric.

### T-001 / Task 1: Make Bootstrap Atomic And Unread Aggregation Set-Based

**Files:**

- Modify: `apps/desktop/layer/main/src/application/unread/service.ts`
- Modify: `apps/desktop/layer/main/src/application/unread/service.test.ts`
- Modify: `apps/desktop/layer/main/src/remote/manager.ts`
- Modify: `apps/desktop/layer/main/src/remote/manager.test.ts`

**Interfaces:**

- Consumes: existing PostgreSQL tables/relations, `subscriptionApplicationService`, `collectionApplicationService`, `settingsApplicationService`, and retained `GET /api/bootstrap`.
- Produces: grouped unread `{id,count}` rows using existing schema and a complete atomic `RemoteBootstrapPayload` in the existing `{data}` envelope.

**Traceability:**

- Source AC: `AC-5`, `AC-7`
- Design anchors: `D-008`, `D-013`, `D-014`
- Test cases: `TC-5`, `TC-6`
- Task anchor: `T-001`

**Expected execution evidence:**

- `commands_run`: `pnpm --filter @suhui/electron-main exec vitest run src/application/unread/service.test.ts src/remote/manager.test.ts`
- `evidence_summary`: SQL tests show grouped result rows, `read IS NOT TRUE`, deleted/ inactive relation exclusion, and no full entry-row load; bootstrap tests show one provider response with all six metadata fields and retained URI/envelope.
- `remaining_risk`: representative SQL/EXPLAIN on both fixtures is collected in child plan 06; any evidence requiring an index/schema change triggers the hard stop.

**Review focus:**

- Verify the query reads only group ID/count columns and does not load article rows into JS.
- Verify legacy NULL read rows are counted unread and active visibility semantics remain unchanged.
- Verify bootstrap failures return the existing safe 500 behavior without SQL, path, URL query, body, or connection details.

**Support lenses:** `api-designer`, `architecture-designer`, `sql-style`

- [ ] **Step 1: Write failing grouped-query and bootstrap-shape tests**

```ts
it("groups active unread entries in SQL and treats NULL as unread", async () => {
  await expect(unreadApplicationService.listUnreadCounts()).resolves.toEqual([
    { id: "feed-1", count: 3 },
  ])
  expect(entriesFindMany).not.toHaveBeenCalled()
  expect(executedSql).toContain("IS NOT TRUE")
  expect(executedSql).toContain("GROUP BY")
})

it("serves one complete bootstrap envelope", async () => {
  await expect(getJson("/api/bootstrap")).resolves.toEqual({
    data: {
      subscriptions: [],
      feeds: [],
      unread: [],
      collections: [],
      settings,
      capabilities,
    },
  })
})
```

- [ ] **Step 2: Run focused main tests to verify failure**

Run: `pnpm --filter @suhui/electron-main exec vitest run src/application/unread/service.test.ts src/remote/manager.test.ts`

Expected: FAIL because unread entries are loaded with `findMany`, NULL is excluded by `eq(read,false)`, and bootstrap lacks collections/explicit feeds.

- [ ] **Step 3: Implement the minimal set-based query and complete envelope**

Use Drizzle `select`, `count`, `groupBy`, `isNull`, the explicit predicate ``sql`${entriesTable.read} IS NOT TRUE` ``, and active-subscription `EXISTS`/joins over existing columns. Return only grouped source IDs/counts and merge grouped legacy `unread` rows with grouped entry counts; do not loop over entry rows. In `getBootstrap`, issue independent metadata queries concurrently and assemble the complete payload only after all resolve:

```ts
const [subscriptions, unread, collections, settings] = await Promise.all([
  subscriptionApplicationService.listSubscriptions(),
  unreadApplicationService.listUnreadCounts(),
  collectionApplicationService.listCollections(),
  Promise.resolve(settingsApplicationService.getSettings()),
])
return {
  subscriptions,
  feeds: extractBootstrapFeeds(subscriptions),
  unread,
  collections,
  settings,
  capabilities: settingsApplicationService.getCapabilities(),
}
```

- [ ] **Step 4: Run focused tests and main typecheck**

Run: `pnpm --filter @suhui/electron-main exec vitest run src/application/unread/service.test.ts src/remote/manager.test.ts`

Expected: PASS; the mock rejects any `entriesTable.findMany` access and validates grouped SQL semantics.

Run: `pnpm --filter @suhui/electron-main typecheck`

Expected: PASS, or record fresh baseline-blocked evidence with exact historical `rootDir`/file-list errors if those unrelated failures remain.

- [ ] **Step 5: Record task evidence**

```yaml
task_anchor: T-001
source_ac: [AC-5, AC-7]
design_anchors: [D-008, D-013, D-014]
test_cases: [TC-5, TC-6]
commands_run:
  - pnpm --filter @suhui/electron-main exec vitest run src/application/unread/service.test.ts src/remote/manager.test.ts: PASS
evidence_summary: bootstrap is one complete metadata envelope and unread aggregation is grouped SQL over the unchanged schema
remaining_risk: fixture EXPLAIN evidence remains for child plan 06
```

### T-002 / Task 2: Replace Pre-Mount Hydration With One Bootstrap Client

**Files:**

- Create: `packages/internal/store/src/remote/bootstrap.ts`
- Create: `packages/internal/store/src/remote/bootstrap.test.ts`
- Modify: `packages/internal/store/src/remote/hydrate.ts`
- Modify: `packages/internal/store/src/remote/index.ts`
- Modify: `packages/internal/store/src/remote/transforms.ts`
- Modify: `packages/internal/store/src/remote/transforms.test.ts`
- Modify: `packages/internal/store/src/runtime/client.ts`
- Modify: `packages/internal/store/src/runtime/client.test.ts`

**Interfaces:**

- Consumes: complete `/api/bootstrap` envelope from `T-001`, existing store actions, settings/capabilities stores used by Remote, and retained endpoint clients.
- Produces: `runtimeClient.bootstrap.get`, `RemoteBootstrapPayload`, synchronous all-or-nothing metadata application, and reset helpers alongside the temporarily retained pre-mount caller that `T-003` removes.

**Traceability:**

- Source AC: `AC-5`, `AC-7`
- Design anchors: `D-008`, `D-013`
- Test cases: `TC-5`, `TC-6`
- Task anchor: `T-002`

**Expected execution evidence:**

- `commands_run`: `pnpm --filter @suhui/store exec vitest run src/remote/bootstrap.test.ts src/remote/transforms.test.ts src/runtime/client.test.ts`
- `evidence_summary`: the new bootstrap client makes exactly one `/api/bootstrap` request; malformed payload produces no partial store writes; valid payload replaces all metadata and reports exact loaded counts; the existing caller still compiles until `T-003` migrates it.
- `remaining_risk`: React mount order and visible state remain for `T-003`.

**Review focus:**

- Verify validation completes before any store mutation and no asynchronous gap exposes partial metadata.
- Verify old individual API clients remain for post-bootstrap mutations/reconnect and only the initial bootstrap path is replaced.
- Verify the compatibility hold is explicitly temporary and limited to the current `main.tsx` caller; final removal proof belongs to `T-003` and excludes historical docs.

**Support lenses:** `api-designer`, `architecture-designer`

- [ ] **Step 1: Write failing runtime and atomic-apply tests**

```ts
it("loads metadata with one bootstrap request", async () => {
  await runtimeClient.bootstrap.get()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith("/api/bootstrap", expect.anything())
})

it("does not publish a partial malformed bootstrap", () => {
  seedPreviousSuccessfulStores()
  expect(() => applyRemoteBootstrapInSession(malformedPayload)).toThrow()
  expect(readAllRemoteStores()).toEqual(previousSuccessfulStores)
})
```

- [ ] **Step 2: Run focused store tests to verify failure**

Run: `pnpm --filter @suhui/store exec vitest run src/remote/bootstrap.test.ts src/remote/transforms.test.ts src/runtime/client.test.ts`

Expected: FAIL because no bootstrap client/apply contract exists and hydration performs three independent requests.

- [ ] **Step 3: Implement one bootstrap request and migrate/remove the obsolete surface**

Add the exact interfaces above, validate arrays/object fields into local transformed values, then synchronously update stores and return loaded counts. Export bootstrap APIs from `remote/index.ts` while retaining the existing hydration export unchanged for the one current `main.tsx` caller; do not route new code through it. Retain `resetRemoteBootstrapStores()` and ensure it disconnects SSE through the established Remote reset owner, not during an ordinary retry. `T-003` migrates the caller and removes the obsolete file/export in the same green task.

- [ ] **Step 4: Run tests, typecheck, and caller proof**

Run: `pnpm --filter @suhui/store exec vitest run src/remote/bootstrap.test.ts src/remote/transforms.test.ts src/runtime/client.test.ts`

Expected: PASS.

Run: `pnpm --filter @suhui/store typecheck`

Expected: PASS; the existing hydration caller/export remains intact until `T-003`, so this task has no temporary compile failure.

- [ ] **Step 5: Record task evidence**

```yaml
task_anchor: T-002
source_ac: [AC-5, AC-7]
design_anchors: [D-008, D-013]
test_cases: [TC-5, TC-6]
commands_run:
  - pnpm --filter @suhui/store exec vitest run src/remote/bootstrap.test.ts src/remote/transforms.test.ts src/runtime/client.test.ts: PASS
evidence_summary: one validated bootstrap client and atomic store-apply path exist without breaking the current renderer entry
remaining_risk: the obsolete pre-mount caller is deliberately retained only until T-003
```

### T-003 / Task 3: Mount The Remote Shell First And Expose Independent States

**Files:**

- Create: `apps/desktop/layer/renderer/src/remote/remote-bootstrap.tsx`
- Create: `apps/desktop/layer/renderer/src/remote/remote-bootstrap.test.tsx`
- Create: `apps/desktop/layer/renderer/src/remote/remote-performance.ts`
- Create: `apps/desktop/layer/renderer/src/remote/remote-performance.test.ts`
- Modify: `apps/desktop/layer/renderer/src/remote/main.tsx`
- Modify: `apps/desktop/layer/renderer/src/remote/remote-app.tsx`
- Modify: `apps/desktop/layer/renderer/src/remote/remote.css`
- Remove: `packages/internal/store/src/remote/hydrate.ts`
- Modify: `packages/internal/store/src/remote/index.ts`

**Interfaces:**

- Consumes: `runtimeClient.bootstrap.get`, `applyRemoteBootstrapInSession`, plan-01 bounded `useEntriesQuery`, plan-03 SSE coordinator/reconnect behavior, and the exact metric API above.
- Produces: synchronous root mount, stable loading/error/ready shell, retryable metadata and entries panes, independent SSE connection state, truthful readiness/error metrics, and final removal of the obsolete hydration export/file.

**Traceability:**

- Source AC: `AC-5`, `AC-7`
- Design anchors: `D-008`, `D-013`
- Test cases: `TC-5`, `TC-6`
- Task anchor: `T-003`

**Expected execution evidence:**

- `commands_run`: `pnpm --filter @suhui/web exec vitest run src/remote/remote-bootstrap.test.tsx src/remote/remote-performance.test.ts src/remote/remote-view-model.test.ts src/remote/entry-navigation.test.ts`
- `evidence_summary`: delayed and rejected promises prove visible shell commit precedes bootstrap settlement; metadata and entries errors have independent retry controls; mobile/desktop layouts stay bounded; errors record only error-visible metrics and never data-ready.
- `remaining_risk`: production timing thresholds are measured in child plan 06.

**Review focus:**

- Verify no HTTP request can run before the first React commit and shell does not masquerade loading as an empty dataset.
- Verify entries failure does not unmount sidebar/metadata and bootstrap failure does not destroy the root/providers.
- Verify SSE does not gate ready, initial connection is `connecting`, and disconnection remains explicit.
- Verify `remote_data_ready_ms` requires both successful bootstrap and a successful/confirmed-empty first entry page.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Write failing mount-order, failure, retry, and metric tests**

```tsx
it("commits the shell before the delayed bootstrap settles", async () => {
  const bootstrap = deferred<RemoteBootstrapPayload>()
  const order: string[] = []
  markRemoteMetricMock.mockImplementation((name) => {
    if (name === "remote_shell_visible_ms") order.push("commit")
    return 1
  })
  runtimeClient.bootstrap.get = vi.fn(() => {
    order.push("request")
    return bootstrap.promise
  })
  render(<RemoteApp />)
  expect(screen.getByTestId("remote-reader-shell")).toBeVisible()
  expect(screen.getByText("Loading subscriptions")).toBeVisible()
  expect(order.slice(0, 2)).toEqual(["commit", "request"])
})

it("does not count an entries error as data ready", async () => {
  resolveBootstrap(validPayload)
  rejectInitialEntries(new Error("entries failed"))
  expect(await screen.findByText("Retry entries")).toBeVisible()
  expect(metrics.has("remote_entries_error_visible_ms")).toBe(true)
  expect(metrics.has("remote_data_ready_ms")).toBe(false)
})
```

- [ ] **Step 2: Run focused renderer tests to verify failure**

Run: `pnpm --filter @suhui/web exec vitest run src/remote/remote-bootstrap.test.tsx src/remote/remote-performance.test.ts`

Expected: FAIL because rendering is blocked before hydration, error UI/retry metrics do not exist, and connection starts as truthy.

- [ ] **Step 3: Implement synchronous mount and independent state boundaries**

Call `beginRemotePerformanceSession()` and `ReactDOM.createRoot(container).render(...)` directly in module execution; do not wrap render in an async initializer. `useRemoteBootstrap()` starts the query after mount, applies metadata on success, exposes `retry`, and records ready/error after the corresponding UI commit. Connect SSE in a separate mount effect. In `RemoteApp`, always render the reader layout; pass bootstrap phase to the sidebar and entries query state to the timeline so loading uses reserved skeleton rows, errors render in-pane retry buttons, and successful empty results render the existing empty state. Once `main.tsx` no longer imports it, remove `hydrate.ts` and the `hydrateFromRemote`/`RemoteHydrateStatus` exports from `remote/index.ts` in this same task.

Use `useLayoutEffect` in the root shell to mark `remote_shell_visible_ms`; use a one-shot effect after successful/empty first page to mark `remote_initial_entries_ready_ms` and call `markRemoteDataReadyIfComplete`. Do not mark either on `isError` or request start.

- [ ] **Step 4: Run behavior tests, typecheck, and removal assertion**

Run: `pnpm --filter @suhui/web exec vitest run src/remote/remote-bootstrap.test.tsx src/remote/remote-performance.test.ts src/remote/remote-view-model.test.ts src/remote/entry-navigation.test.ts`

Expected: PASS for delayed success, bootstrap failure/retry, entries failure/retry, confirmed empty, desktop viewport, mobile viewport, and existing selection/read behavior.

Run: `pnpm --filter @suhui/web typecheck`

Expected: PASS.

Run: `rg -n 'await .*bootstrap|hydrateFromRemote|RemoteHydrateStatus|loadInitialEntries' apps/desktop/layer/renderer/src/remote packages/internal/store/src/remote`

Expected: no matches.

- [ ] **Step 5: Record task evidence**

```yaml
task_anchor: T-003
source_ac: [AC-5, AC-7]
design_anchors: [D-008, D-013]
test_cases: [TC-5, TC-6]
commands_run:
  - pnpm --filter @suhui/web exec vitest run src/remote/remote-bootstrap.test.tsx src/remote/remote-performance.test.ts src/remote/remote-view-model.test.ts src/remote/entry-navigation.test.ts: PASS
  - pnpm --filter @suhui/web typecheck: PASS
evidence_summary: Remote shell commits before requests and metadata, entries, and SSE have independent honest states and metrics
remaining_risk: production P95 remains for child plan 06
```

### T-004 / Task 4: Migrate The Fallback Shell To Bootstrap And Cursor Pages

**Files:**

- Modify: `apps/desktop/layer/main/src/remote/shell.ts`
- Create: `apps/desktop/layer/main/src/remote/shell.test.ts`

**Interfaces:**

- Consumes: retained `GET /api/bootstrap`, plan-01 `GET /api/entries?feedId&limit=20&cursor` response `{data,page}`, existing SSE event names, and existing read/refresh routes.
- Produces: visible static fallback shell, bootstrap retry, paged entry rendering with `nextCursor`, and no initial `/api/subscriptions`/`/api/unread` fan-out.

**Traceability:**

- Source AC: `AC-2`, `AC-5`, `AC-7`
- Design anchors: `D-004`, `D-008`, `D-013`
- Test cases: `TC-2`, `TC-5`, `TC-6`
- Task anchor: `T-004`

**Expected execution evidence:**

- `commands_run`: `pnpm --filter @suhui/electron-main exec vitest run src/remote/shell.test.ts src/remote/manager.test.ts`
- `evidence_summary`: script tests show first metadata request is `/api/bootstrap`, entries always request `limit=20`, `Load more` sends the prior `page.nextCursor` exactly once, retry is visible, and no page-one repetition/unbounded client aggregation occurs.
- `remaining_risk`: browser production timing belongs to child plan 06.

**Review focus:**

- Verify the fallback shell is already visible in static HTML before JavaScript requests and errors retain retry controls.
- Verify pagination appends pages without replacing previous rows or repeating the first page.
- Verify existing read, refresh, and SSE event names remain usable and refresh events reset to the first page before calibration.

**Support lenses:** `api-designer`, `architecture-designer`

- [ ] **Step 1: Write failing script contract tests**

```ts
it("bootstraps metadata atomically and advances the entry cursor", () => {
  const script = getRemoteShellScript()
  expect(script).toContain('fetch("/api/bootstrap")')
  expect(script).not.toContain('fetch("/api/subscriptions")')
  expect(script).not.toContain('fetch("/api/unread")')
  expect(script).toContain('params.set("limit", "20")')
  expect(script).toContain('params.set("cursor", nextEntryCursor)')
})
```

- [ ] **Step 2: Run shell tests to verify failure**

Run: `pnpm --filter @suhui/electron-main exec vitest run src/remote/shell.test.ts`

Expected: FAIL because the fallback shell uses separate metadata calls and ignores page cursors.

- [ ] **Step 3: Implement bootstrap, retry, and load-more state**

Add stable retry buttons to the static HTML. Replace `loadSubscriptions` with `loadBootstrap`, assign subscriptions/unread only after the complete response succeeds, and preserve the existing shell on failure. Track `nextEntryCursor`; `loadEntries(feedId, {append:false})` requests `limit=20` with no cursor and resets rows, while `loadEntries(feedId, {append:true})` sends the saved cursor, appends rows, and replaces the saved cursor from `payload.page.nextCursor`. Disable/hide `Load more` when `hasMore` is false or the request is pending.

- [ ] **Step 4: Run shell/manager tests and main typecheck**

Run: `pnpm --filter @suhui/electron-main exec vitest run src/remote/shell.test.ts src/remote/manager.test.ts`

Expected: PASS; route/envelope tests remain compatible and shell script contract uses bootstrap/cursor pages.

Run: `pnpm --filter @suhui/electron-main typecheck`

Expected: PASS, or record the exact unrelated historical baseline blockage without claiming a pass.

- [ ] **Step 5: Record task evidence**

```yaml
task_anchor: T-004
source_ac: [AC-2, AC-5, AC-7]
design_anchors: [D-004, D-008, D-013]
test_cases: [TC-2, TC-5, TC-6]
commands_run:
  - pnpm --filter @suhui/electron-main exec vitest run src/remote/shell.test.ts src/remote/manager.test.ts: PASS
evidence_summary: fallback shell uses one bootstrap envelope and bounded cursor pages with explicit retry
remaining_risk: production Remote P95 remains for child plan 06
```

## Plan-Level Verification

- [ ] Run all focused suites:

```bash
pnpm --filter @suhui/electron-main exec vitest run \
  src/application/unread/service.test.ts \
  src/remote/manager.test.ts \
  src/remote/shell.test.ts
pnpm --filter @suhui/store exec vitest run \
  src/remote/bootstrap.test.ts \
  src/remote/transforms.test.ts \
  src/runtime/client.test.ts \
  src/remote/sse-handler.test.ts
pnpm --filter @suhui/web exec vitest run \
  src/remote/remote-bootstrap.test.tsx \
  src/remote/remote-performance.test.ts \
  src/remote/remote-view-model.test.ts \
  src/remote/entry-navigation.test.ts
```

Expected: all suites PASS; delayed/failing bootstrap and entries cases show shell-first ordering, visible retry, successful/empty-only ready semantics, and independent SSE state.

- [ ] Run typechecks:

```bash
pnpm --filter @suhui/store typecheck
pnpm --filter @suhui/web typecheck
pnpm --filter @suhui/electron-main typecheck
```

Expected: store/web PASS. Electron main PASS or a fresh exact historical baseline-blocked record; no new error may be hidden by that baseline.

- [ ] Run caller proof and negative assertions from the Surface Inventory.

Expected: no obsolete hydration surface or pre-render await remains; initial metadata has one request; unread grouping has no full entry-row read; fallback consumes cursor metadata; no DB/schema/config/user-owned file changed.

- [ ] Run a production Remote browser smoke check at desktop and mobile viewport with controlled request delay/failure:

```text
1. Delay /api/bootstrap by 2000ms: shell and loading skeleton are visible before response.
2. Fail /api/bootstrap once: bootstrap error and Retry remain inside the shell; retry succeeds.
3. Succeed bootstrap and fail initial /api/entries once: sidebar remains usable; timeline shows Retry entries; retry succeeds.
4. Disconnect /events: connection reads disconnected; cached reading remains visible.
5. Confirm successful/empty run records remote_shell_visible_ms, remote_bootstrap_ready_ms,
   remote_initial_entries_ready_ms, and remote_data_ready_ms; failure runs record only the relevant error-visible metric.
6. At 390px and desktop width, skeleton/error content stays inside its pane without covering adjacent controls.
```

Expected: all six observations hold. These are functional readiness checks, not the production P95 claim; child plan 06 supplies >=20 cold/warm samples for both fixtures and thresholds Remote shell `<=800ms`, Remote data ready `<=1500ms`.

- [ ] Run plan-level `final-review`, update `.loopx/multi-plan/suhui-performance-refactor/state.json` fields `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review`, then create one implementation commit only if review is clean.

## Database Stop Gate

This plan may rewrite projection, predicate, grouping, joins/`EXISTS`, and batching only. It must not add or alter an index, table, column, migration, database engine, or configuration precedence. Child plan 06 records representative SQL and `EXPLAIN (ANALYZE, BUFFERS)` for normal and stress fixtures. If evidence shows the Remote thresholds require an index/schema change, stop execution, preserve the evidence, mark the package blocked, and return to `clarify/spec`; do not modify the database layer in this plan.

## Execution Handoff

Package mode is primary and executes this plan after child plan 03 according to `00-overview.md`:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md
```

Inline package fallback:

```text
$exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md
```

Direct targeted/resume execution only:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/04-remote-progressive-bootstrap.md
$exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/04-remote-progressive-bootstrap.md
```

Do not stage or commit per task. After all four tasks and plan-level review pass, create one child-plan implementation commit; package execution then advances to `05-renderer-startup-and-sidebar.md`.
