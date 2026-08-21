# Refresh ChangeSets And Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-13-suhui-performance-refactor/需求设计文档.md`

**Goal:** Replace cumulative refresh broadcasts and broad renderer reloads with one versioned ChangeSet per completed mutation batch and one deduplicating invalidation coordinator shared by Desktop and Remote consumers.

**Architecture:** Electron main remains the write coordinator and emits the existing IPC/SSE event names with an additive `EntryChangeEventV1` payload. Mutation responses carry the same `batchId` and ChangeSet as the later transport event; renderer consumers route response and event paths through one bounded in-memory coordinator that applies the `D-007` invalidation matrix and treats PostgreSQL queries as the source of truth.

**Tech Stack:** TypeScript, Electron IPC, HTTP/SSE, React Query, Vitest, pnpm.

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

- Package dependency: complete and review `01-entry-query-and-transports.md` first. This plan consumes its normalized entry-list query key and bounded page ownership; it must not reintroduce store-wide entry hydration.
- Direct execution dependency: before `T-002`, verify the entry query key exposes a normalized `EntryListQuery` descriptor. If plan 01 used a helper name other than `getEntryListQueryDescriptor`, adapt only the import/name while preserving the exact descriptor contract below.
- Commit boundary: tasks do not stage or commit. After all tasks, verification, and plan-level `final-review` pass, create one implementation commit for this child plan.

## File Structure

| Path                                                                                 | Change | Responsibility                                                                                                             |
| ------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/internal/shared/src/entry-change.ts`                                       | Create | Versioned ChangeSet, response envelope, normalization, and type guards shared by main and renderer.                        |
| `apps/desktop/layer/main/src/manager/local-feed-refresh-events.ts`                   | Modify | Send one existing Desktop IPC event with the shared ChangeSet payload.                                                     |
| `apps/desktop/layer/main/src/manager/local-feed-refresh-events.test.ts`              | Modify | Characterize successful-feed normalization, zero-success suppression, and payload compatibility.                           |
| `apps/desktop/layer/main/src/ipc/services/db.ts`                                     | Modify | Allocate one batch ID, remove per-feed cumulative broadcasts, return and broadcast the same completed ChangeSet.           |
| `apps/desktop/layer/main/src/ipc/services/db.test.ts`                                | Modify | Prove 1/10/50 feed batches emit once and partial failures include only successful feeds.                                   |
| `apps/desktop/layer/main/src/manager/feed-refresh.ts`                                | Modify | Preserve existing refresh-all fields while additively returning per-feed results required to construct a scoped ChangeSet. |
| `apps/desktop/layer/main/src/remote/manager.ts`                                      | Modify | Return additive mutation ChangeSets and publish existing SSE names with reason-specific payloads.                          |
| `apps/desktop/layer/main/src/remote/manager.test.ts`                                 | Modify | Prove response/event batch ID identity, event names, reason mapping, and response compatibility.                           |
| `packages/internal/store/src/modules/entry/change-invalidation.ts`                   | Create | Bounded batch dedupe, query-scope intersection, invalidation matrix, and reconnect compensation.                           |
| `packages/internal/store/src/modules/entry/change-invalidation.test.ts`              | Create | Unit-test duplicate response/event handling, active refetch count, stale-only behavior, and all reasons.                   |
| `packages/internal/store/src/modules/entry/hooks.ts`                                 | Modify | Export the normalized entry query descriptor consumed by the coordinator; do not change page ownership.                    |
| `apps/desktop/layer/renderer/src/lib/local-feed-refresh-sync.ts`                     | Modify | Convert Desktop IPC payloads to the shared coordinator instead of fetching every successful feed.                          |
| `apps/desktop/layer/renderer/src/lib/local-feed-refresh-sync.test.ts`                | Modify | Prove background and manual response paths converge on one coordinator call.                                               |
| `apps/desktop/layer/renderer/src/providers/local-feed-refresh-sync-provider.tsx`     | Modify | Route the existing IPC channel into the coordinator and preserve serialized error handling.                                |
| `apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.ts`      | Modify | Route single/batch refresh responses into the same coordinator; remove feed-by-feed `fetchEntries` fan-out.                |
| `apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts` | Modify | Prove manual responses are handled once and later IPC duplicates are harmless.                                             |
| `packages/internal/store/src/remote/sse-handler.ts`                                  | Modify | Normalize existing SSE events, execute the reason matrix, and compensate once after reconnect.                             |
| `packages/internal/store/src/remote/sse-handler.test.ts`                             | Create | Prove event parsing, reconnect compensation, connection honesty, and no refresh-triggered collection reload.               |
| `packages/internal/store/src/modules/unread/invalidate-entries.ts`                   | Modify | Delegate read-mutation settlement to the shared coordinator.                                                               |
| `packages/internal/store/src/modules/unread/invalidate-entries.test.ts`              | Modify | Preserve immediate unread-only calibration through the reason=`read` path.                                                 |
| `packages/internal/store/src/runtime/client.ts`                                      | Modify | Return additive mutation response envelopes to renderer callers without changing existing routes or methods.               |

## Surface Inventory

| Surface                                  | Current source/caller                                                                                                                                                    | Required result                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IPC event `local-feed-refresh-completed` | Producer: `apps/desktop/layer/main/src/manager/local-feed-refresh-events.ts`; consumer: `apps/desktop/layer/renderer/src/providers/local-feed-refresh-sync-provider.tsx` | Retain the channel name; payload additively becomes `EntryChangeEventV1` and is emitted once after batch settle.                                                                  |
| SSE event `entries.updated`              | Producer: `apps/desktop/layer/main/src/remote/manager.ts`; consumers: `packages/internal/store/src/remote/sse-handler.ts`, `apps/desktop/layer/main/src/remote/shell.ts` | Retain the event name; include `version`, `batchId`, `reason`, scope IDs, counts, and completion time.                                                                            |
| SSE event `subscriptions.updated`        | Producer: `apps/desktop/layer/main/src/remote/manager.ts`; same two Remote consumers                                                                                     | Retain the name; normalize to reason=`subscription`; do not treat it as a generic refresh.                                                                                        |
| Desktop refresh response                 | `db.refreshFeed`, `db.refreshLocalSubscribedFeeds`; caller: `apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.ts`                              | Preserve existing data fields and add `batchId` plus `changeSet`; response and IPC event use the same ID.                                                                         |
| Remote mutation responses                | `/api/entries/read`, `/api/entries/star`, `/api/feeds/:id/refresh`, `/api/feeds/refresh-all`, subscription mutations, `/api/import`                                      | Preserve route/method and existing `{ok}` or `{data}` fields; add `batchId` and `changeSet` in the existing envelope.                                                             |
| Entry query invalidation                 | Direct calls in `packages/internal/store/src/remote/sse-handler.ts`, `packages/internal/store/src/modules/unread/invalidate-entries.ts`, and Desktop refresh helpers     | One coordinator applies the exact matrix; no response/event double refetch and no ordinary-refresh collections refresh.                                                           |
| Refresh audit                            | Existing `refreshLog` calls in `apps/desktop/layer/main/src/ipc/services/db.ts`                                                                                          | Preserve existing audit events and correlate producer/event/refetch with `batchId`; never log titles, bodies, URLs, SQL parameters, connection strings, or local sensitive paths. |

### Caller Proof

Run before edits and attach the output to task evidence:

```bash
rg -n 'local-feed-refresh-completed|entries\.updated|subscriptions\.updated' \
  apps/desktop/layer/main/src apps/desktop/layer/renderer/src packages/internal/store/src
rg -n 'broadcastLocalFeedRefreshCompleted|fetchEntries\(|invalidateQueries\(|refreshCollections\(' \
  apps/desktop/layer/main/src/ipc/services/db.ts \
  apps/desktop/layer/renderer/src/lib \
  apps/desktop/layer/renderer/src/modules/entry-column/layouts \
  packages/internal/store/src/remote \
  packages/internal/store/src/modules/unread
rg -n 'POST.*api/(entries/read|entries/star|feeds/.*/refresh|feeds/refresh-all|subscriptions|import)|runtimeClient\.(feeds|entries|collections|subscriptions|importExport)' \
  apps/desktop/layer/main/src/remote \
  apps/desktop/layer/renderer/src \
  packages/internal/store/src
```

Expected: the evidence lists only current production producers/consumers above. Historical files under `docs/`, `.loopx/`, changelogs, generated artifacts, and dependencies do not justify retaining cumulative broadcasts or direct broad invalidation.

### Negative Assertions

Run after implementation:

```bash
rg -n 'broadcastLocalFeedRefreshCompleted' apps/desktop/layer/main/src/ipc/services/db.ts
rg -n 'syncSuccessfulLocalRefreshFeeds|feedIds\.map\(.*fetchEntries|refreshCollections\(\)' \
  apps/desktop/layer/renderer/src/lib/local-feed-refresh-sync.ts \
  apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.ts \
  packages/internal/store/src/remote/sse-handler.ts
rg -n 'queryKey:\s*\["entries"\]' \
  apps/desktop/layer/renderer/src/providers \
  apps/desktop/layer/renderer/src/lib \
  packages/internal/store/src/remote \
  packages/internal/store/src/modules/unread
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*' '.gitignore' '.vscode/settings.json'
```

Expected: `db.ts` has exactly one completed-batch broadcast call outside the per-feed worker; old feed-by-feed renderer reload helpers and direct broad entry invalidations are absent from strict current paths; `refreshCollections()` is not called for reason=`refresh`; no migration/schema/config-precedence file changes exist; `.gitignore` and `.vscode/settings.json` remain untouched.

## Exact Interfaces

```ts
// packages/internal/shared/src/entry-change.ts
export type EntryChangeReason = "refresh" | "read" | "collection" | "subscription" | "import"
export type EntryChangeScope = "feeds" | "all"

export type EntryChangeEventV1 = {
  version: 1
  batchId: string
  reason: EntryChangeReason
  source: string
  scope: EntryChangeScope
  feedIds: string[]
  entryIds?: string[]
  refreshed?: number
  failed?: number
  completedAt: number
  feedId?: string
}

export type EntryChangeResponse<T> = T & {
  batchId: string
  changeSet: EntryChangeEventV1
}

export const createEntryChangeEventV1: (
  input: Omit<EntryChangeEventV1, "version">,
) => EntryChangeEventV1
export const parseEntryChangeEventV1: (input: unknown) => EntryChangeEventV1 | null
```

Normalization contract: trim, remove empty IDs, and preserve first-seen order while deduplicating `feedIds`/`entryIds`; `scope="feeds"` requires at least one successful feed, while zero-success refresh responses carry an empty `feedIds` ChangeSet but publish no entries event; single-feed refresh additionally sets `feedId` to the same sole ID. `batchId` uses the repository's existing UUID/trace-ID facility and is allocated once per mutation invocation, not once per transport.

```ts
// packages/internal/store/src/modules/entry/change-invalidation.ts
export type EntryListQueryDescriptor = {
  scope:
    | { kind: "timeline"; view?: number; excludePrivate?: boolean }
    | { kind: "feeds"; feedIds: string[] }
    | { kind: "list"; listId: string }
    | { kind: "inbox"; inboxId: string }
    | { kind: "collection"; view?: number }
  read?: boolean
}

export type EntryChangeHandleResult = "handled" | "duplicate" | "ignored-invalid"

export interface EntryChangeInvalidationCoordinator {
  handle(change: unknown, origin: "response" | "ipc" | "sse"): Promise<EntryChangeHandleResult>
  handleReconnect(): Promise<void>
  resetForTests(): void
}

export const entryChangeInvalidationCoordinator: EntryChangeInvalidationCoordinator
```

The coordinator keeps at most 512 processed IDs for five minutes; this is bounded rebuildable session state, not a persistent event log. It uses one `queryClient.invalidateQueries({predicate, refetchType:"active"})` call per affected query family so matching inactive queries become stale and matching active queries refetch at most once. The reason matrix is exact:

| reason         | entries                                                                        | unread    | collections                          | subscriptions |
| -------------- | ------------------------------------------------------------------------------ | --------- | ------------------------------------ | ------------- |
| `refresh`      | only intersecting scopes stale; active query refetch once                      | once      | unchanged                            | unchanged     |
| `read`         | cached pages containing `entryIds` settle after the existing optimistic update | once      | unchanged                            | unchanged     |
| `collection`   | collection scopes stale                                                        | unchanged | once                                 | unchanged     |
| `subscription` | all entry scopes stale                                                         | once      | once, preserving unsubscribe cleanup | once          |
| `import`       | all entry scopes stale                                                         | once      | once                                 | once          |

For a refresh, timeline queries intersect any non-empty successful feed set; feeds scopes intersect by feed ID; list/inbox/collection queries intersect only when their cached summary items contain a successful `feedId`. Empty successful-feed sets do not invalidate. Reconnect performs exactly one all-entry stale/active-refetch plus one atomic Remote bootstrap refresh, independent of historical events.

### T-001 / Task 1: Define The ChangeSet And Emit One Completed Batch

**Files:**

- Create: `packages/internal/shared/src/entry-change.ts`
- Modify: `apps/desktop/layer/main/src/manager/local-feed-refresh-events.ts`
- Modify: `apps/desktop/layer/main/src/manager/local-feed-refresh-events.test.ts`
- Modify: `apps/desktop/layer/main/src/ipc/services/db.ts`
- Modify: `apps/desktop/layer/main/src/ipc/services/db.test.ts`
- Modify: `apps/desktop/layer/main/src/manager/feed-refresh.ts`
- Modify: `apps/desktop/layer/main/src/remote/manager.ts`
- Modify: `apps/desktop/layer/main/src/remote/manager.test.ts`

**Interfaces:**

- Consumes: existing `refreshFeed`, `refreshLocalSubscribedFeeds`, `FeedRefreshService.refreshAll`, existing IPC channel `local-feed-refresh-completed`, and existing SSE names `entries.updated`/`subscriptions.updated`.
- Produces: `EntryChangeEventV1`, `EntryChangeResponse<T>`, one completed Desktop refresh event, reason-specific Remote events, and additive response fields with matching `batchId`.

**Traceability:**

- Source AC: `AC-4`, `AC-6`
- Design anchors: `D-007`, `D-013`
- Test cases: `TC-4`, `TC-6`
- Task anchor: `T-001`

**Expected execution evidence:**

- `commands_run`: `pnpm --filter @suhui/electron-main exec vitest run src/manager/local-feed-refresh-events.test.ts src/ipc/services/db.test.ts src/remote/manager.test.ts`
- `evidence_summary`: tests prove 1/10/50 completed refresh batches publish one event, partial failures include only unique successful feed IDs, zero success publishes none, and every mutation response/event pair has one identical `batchId` with retained route/event names and old response fields.
- `remaining_risk`: production refetch counts are verified by `T-002`-`T-004` and the package performance gate.

**Review focus:**

- Verify no broadcast remains inside the per-feed completion loop and audit results still record individual failures.
- Verify all mutation reasons match the exact matrix and existing URI/method/event names are unchanged.
- Verify payload logs contain IDs/counts only and no content, title, URL query, SQL parameters, connection strings, or local paths.

**Support lenses:** `api-designer`, `architecture-designer`

- [ ] **Step 1: Write failing producer and compatibility tests**

Add table-driven cases equivalent to:

```ts
it.each([1, 10, 50])("emits one completed ChangeSet for %i successful feeds", async (size) => {
  const result = await service.refreshLocalSubscribedFeeds(context, { source: "startup-auto" })
  expect(result.changeSet.feedIds).toHaveLength(size)
  expect(broadcastLocalFeedRefreshCompleted).toHaveBeenCalledTimes(1)
  expect(broadcastLocalFeedRefreshCompleted).toHaveBeenCalledWith(result.changeSet)
})

it("keeps the response and SSE batch id identical", async () => {
  const payload = await postJson("/api/feeds/feed_1/refresh")
  expect(payload.data.feed.id).toBe("feed_1")
  expect(payload.batchId).toBe(payload.changeSet.batchId)
  expect(readSsePayload("entries.updated").batchId).toBe(payload.batchId)
})
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `pnpm --filter @suhui/electron-main exec vitest run src/manager/local-feed-refresh-events.test.ts src/ipc/services/db.test.ts src/remote/manager.test.ts`

Expected: FAIL because responses have no `changeSet`/`batchId`, the batch producer broadcasts cumulatively plus once at completion, and mutation events lack reasons.

- [ ] **Step 3: Add the shared contract and minimal completed-batch producer**

Implement the exact interfaces above. In `refreshLocalSubscribedFeeds`, allocate the ID before work, collect all results, build one ChangeSet after `Promise.all` settles, log `batchId`, broadcast once when successful IDs are non-empty, and return:

```ts
return {
  ...batchResult,
  batchId: changeSet.batchId,
  changeSet,
}
```

For Remote mutations, build the reason-specific ChangeSet after the application operation succeeds, broadcast the existing event name with that ChangeSet, and return the existing response value plus top-level `batchId`/`changeSet`. Extend `FeedRefreshService.refreshAll()` with additive `results: Array<{feedId:string;ok:boolean}>` while retaining `total`, `successCount`, and `failCount`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm --filter @suhui/electron-main exec vitest run src/manager/local-feed-refresh-events.test.ts src/ipc/services/db.test.ts src/remote/manager.test.ts`

Expected: PASS; 1/10/50 cases each report event count `1`, partial failure scopes contain only successful IDs, and zero-success count is `0`.

Run: `pnpm --filter @suhui/electron-main typecheck`

Expected: PASS, or record fresh baseline-blocked evidence with exact historical `rootDir`/file-list errors if those unrelated failures remain; do not report a pass from stale output.

- [ ] **Step 5: Record task evidence**

```yaml
task_anchor: T-001
source_ac: [AC-4, AC-6]
design_anchors: [D-007, D-013]
test_cases: [TC-4, TC-6]
commands_run:
  - pnpm --filter @suhui/electron-main exec vitest run src/manager/local-feed-refresh-events.test.ts src/ipc/services/db.test.ts src/remote/manager.test.ts: PASS
evidence_summary: one completed ChangeSet is returned and published with compatible surfaces and one batch ID
remaining_risk: renderer dedupe and invalidation counts remain for T-002 through T-004
```

### T-002 / Task 2: Implement The Bounded Invalidation Coordinator

**Files:**

- Create: `packages/internal/store/src/modules/entry/change-invalidation.ts`
- Create: `packages/internal/store/src/modules/entry/change-invalidation.test.ts`
- Modify: `packages/internal/store/src/modules/entry/hooks.ts`

**Interfaces:**

- Consumes: `EntryChangeEventV1`, the plan-01 bounded page query key, cached `EntrySummaryPage` items, React Query `invalidateQueries`, and existing store refresh functions for unread/collections/subscriptions.
- Produces: `entryChangeInvalidationCoordinator`, `EntryChangeHandleResult`, normalized query-descriptor extraction, exact reason matrix, batch dedupe, and reconnect compensation.

**Traceability:**

- Source AC: `AC-4`, `AC-6`
- Design anchors: `D-007`, `D-013`
- Test cases: `TC-4`, `TC-6`
- Task anchor: `T-002`

**Expected execution evidence:**

- `commands_run`: `pnpm --filter @suhui/store exec vitest run src/modules/entry/change-invalidation.test.ts`
- `evidence_summary`: a table-driven report shows handled/duplicate results and exact counts for entries, unread, collections, subscriptions across all five reasons; inactive queries are stale and active intersecting queries refetch no more than once.
- `remaining_risk`: transport wiring remains for `T-003` and `T-004`.

**Review focus:**

- Verify the event is never treated as data truth and no event payload is merged into entry pages.
- Verify refresh intersection, read entry-ID settlement, collection-only scope, and all-entry subscription/import behavior match `D-007` exactly.
- Verify dedupe state is bounded and reconnect does not replay historical events.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Write the table-driven failing coordinator test**

```ts
it.each([
  ["refresh", 1, 1, 0, 0],
  ["read", 1, 1, 0, 0],
  ["collection", 1, 0, 1, 0],
  ["subscription", 1, 1, 1, 1],
  ["import", 1, 1, 1, 1],
] as const)(
  "applies the %s matrix",
  async (reason, entries, unread, collections, subscriptions) => {
    await coordinator.handle(change({ reason }), "sse")
    expect(countEntryInvalidations()).toBe(entries)
    expect(refreshUnread).toHaveBeenCalledTimes(unread)
    expect(refreshCollections).toHaveBeenCalledTimes(collections)
    expect(refreshSubscriptions).toHaveBeenCalledTimes(subscriptions)
  },
)

it("dedupes response then event by batchId", async () => {
  expect(await coordinator.handle(change({ batchId: "batch-1" }), "response")).toBe("handled")
  expect(await coordinator.handle(change({ batchId: "batch-1" }), "ipc")).toBe("duplicate")
  expect(countEntryInvalidations()).toBe(1)
})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @suhui/store exec vitest run src/modules/entry/change-invalidation.test.ts`

Expected: FAIL because the coordinator and descriptor extraction do not exist.

- [ ] **Step 3: Implement the minimal coordinator**

Export a descriptor extractor from `hooks.ts`, parse the shared event, prune processed IDs older than five minutes and above 512 entries, mark the current ID before awaiting invalidations, and use one active-refetch invalidation per query family. Implement matrix dispatch as an exhaustive switch that assigns `never` in the default branch so new reasons cannot silently become broad refreshes.

- [ ] **Step 4: Run the test and store typecheck**

Run: `pnpm --filter @suhui/store exec vitest run src/modules/entry/change-invalidation.test.ts`

Expected: PASS with response/event duplicate count `1`, ordinary refresh collections count `0`, and reconnect all-entry/bootstrap compensation count `1` each.

Run: `pnpm --filter @suhui/store typecheck`

Expected: PASS.

- [ ] **Step 5: Record task evidence**

```yaml
task_anchor: T-002
source_ac: [AC-4, AC-6]
design_anchors: [D-007, D-013]
test_cases: [TC-4, TC-6]
commands_run:
  - pnpm --filter @suhui/store exec vitest run src/modules/entry/change-invalidation.test.ts: PASS
  - pnpm --filter @suhui/store typecheck: PASS
evidence_summary: bounded coordinator applies the exact invalidation matrix and dedupes one batch across origins
remaining_risk: none inside coordinator; transport integration remains
```

### T-003 / Task 3: Route Desktop Response And IPC Paths Through One Coordinator

**Files:**

- Modify: `apps/desktop/layer/renderer/src/lib/local-feed-refresh-sync.ts`
- Modify: `apps/desktop/layer/renderer/src/lib/local-feed-refresh-sync.test.ts`
- Modify: `apps/desktop/layer/renderer/src/providers/local-feed-refresh-sync-provider.tsx`
- Modify: `apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts`

**Interfaces:**

- Consumes: `EntryChangeResponse<T>` from Desktop IPC, the retained `local-feed-refresh-completed` event, and `entryChangeInvalidationCoordinator.handle`.
- Produces: one Desktop invalidation per `batchId` for manual single, manual batch, startup-auto, and interval-auto refreshes; no direct per-feed entry reload fan-out.

**Traceability:**

- Source AC: `AC-4`
- Design anchors: `D-007`, `D-013`
- Test cases: `TC-4`
- Task anchor: `T-003`

**Expected execution evidence:**

- `commands_run`: `pnpm --filter @suhui/web exec vitest run src/lib/local-feed-refresh-sync.test.ts src/modules/entry-column/layouts/entry-refresh.test.ts`
- `evidence_summary`: manual response followed by the matching IPC event yields one handled and one duplicate result, while background IPC alone yields one handled result; `fetchEntries` is never called per successful feed.
- `remaining_risk`: Remote SSE wiring remains for `T-004`.

**Review focus:**

- Verify manual requests no longer need a special “ignore manual event” branch because batch dedupe is origin-independent.
- Verify visible refresh errors and existing button pending behavior remain unchanged.
- Verify a zero-success response produces no entry invalidation while preserving returned failure details.

**Support lenses:** `architecture-designer`

- [ ] **Step 1: Replace feed-fetch expectations with failing coordinator expectations**

```ts
it("handles a manual response and dedupes the later IPC event", async () => {
  const result = await refreshAllLocalFeedsAndSyncEntries({ ipc })
  expect(handleChange).toHaveBeenNthCalledWith(1, result.changeSet, "response")
  await syncLocalFeedRefreshCompleted({ payload: result.changeSet })
  expect(handleChange).toHaveBeenNthCalledWith(2, result.changeSet, "ipc")
  expect(fetchEntries).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run focused renderer tests to verify failure**

Run: `pnpm --filter @suhui/web exec vitest run src/lib/local-feed-refresh-sync.test.ts src/modules/entry-column/layouts/entry-refresh.test.ts`

Expected: FAIL because the helpers still fan out `fetchEntries` and ignore manual IPC events.

- [ ] **Step 3: Implement the minimal Desktop wiring**

Make `syncLocalFeedRefreshCompleted({payload})` call `handle(payload, "ipc")` for every valid payload. Make single/batch refresh helpers call `handle(result.changeSet, "response")` after a successful IPC response. Preserve the raw response return value for callers and keep the provider promise queue/error log, but remove `results` reconstruction and `entrySyncServices.fetchEntries` binding.

- [ ] **Step 4: Run focused tests and renderer typecheck**

Run: `pnpm --filter @suhui/web exec vitest run src/lib/local-feed-refresh-sync.test.ts src/modules/entry-column/layouts/entry-refresh.test.ts`

Expected: PASS; no test expects a feed-by-feed fetch.

Run: `pnpm --filter @suhui/web typecheck`

Expected: PASS.

- [ ] **Step 5: Record task evidence**

```yaml
task_anchor: T-003
source_ac: [AC-4]
design_anchors: [D-007, D-013]
test_cases: [TC-4]
commands_run:
  - pnpm --filter @suhui/web exec vitest run src/lib/local-feed-refresh-sync.test.ts src/modules/entry-column/layouts/entry-refresh.test.ts: PASS
  - pnpm --filter @suhui/web typecheck: PASS
evidence_summary: Desktop response and IPC origins converge on one deduplicated invalidation with no per-feed reload fan-out
remaining_risk: none
```

### T-004 / Task 4: Route Remote SSE And Mutations Through The Matrix

**Files:**

- Modify: `packages/internal/store/src/remote/sse-handler.ts`
- Create: `packages/internal/store/src/remote/sse-handler.test.ts`
- Modify: `packages/internal/store/src/modules/unread/invalidate-entries.ts`
- Modify: `packages/internal/store/src/modules/unread/invalidate-entries.test.ts`
- Modify: `packages/internal/store/src/runtime/client.ts`

**Interfaces:**

- Consumes: additive Remote HTTP mutation responses, retained SSE names, `entryChangeInvalidationCoordinator`, current connection callback, and plan-04 bootstrap refresh hook through `handleReconnect`.
- Produces: reason-aware Remote response/event handling, truthful disconnected state, one reconnect compensation, and read mutation settlement through reason=`read`.

**Traceability:**

- Source AC: `AC-4`, `AC-6`
- Design anchors: `D-007`, `D-013`
- Test cases: `TC-4`, `TC-6`
- Task anchor: `T-004`

**Expected execution evidence:**

- `commands_run`: `pnpm --filter @suhui/store exec vitest run src/remote/sse-handler.test.ts src/modules/unread/invalidate-entries.test.ts src/modules/entry/change-invalidation.test.ts`
- `evidence_summary`: SSE tests show reason parsing and one coordinator call, duplicate response/event handling, no collections refresh for ordinary refresh, subscriptions/import matrix coverage, and one reconnect compensation after a disconnected interval.
- `remaining_risk`: production 1/10/50 refetch metrics are collected in child plan 06.

**Review focus:**

- Verify malformed/legacy events do not trigger repeated broad refetch; only a deliberate compatibility normalization with one generated batch ID per received legacy event is allowed during the same-release cutover.
- Verify `subscriptions.updated` retains its event name and normalizes to reason=`subscription`, while `entries.updated` uses its payload reason.
- Verify Remote mutation callers process response ChangeSets immediately and the later SSE event is a deduped no-op.

**Support lenses:** `api-designer`, `architecture-designer`

- [ ] **Step 1: Write failing SSE, reconnect, and read-settlement tests**

```ts
it("does not refresh collections for entries.updated reason refresh", async () => {
  emit("entries.updated", refreshChange)
  await flushPromises()
  expect(handleChange).toHaveBeenCalledWith(refreshChange, "sse")
  expect(refreshCollections).not.toHaveBeenCalled()
})

it("compensates once after reconnect", async () => {
  emitError()
  emitReady()
  await flushPromises()
  expect(handleReconnect).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run focused store tests to verify failure**

Run: `pnpm --filter @suhui/store exec vitest run src/remote/sse-handler.test.ts src/modules/unread/invalidate-entries.test.ts`

Expected: FAIL because SSE directly invalidates all entries, refreshes unread and collections, and reconnect has no bootstrap compensation.

- [ ] **Step 3: Implement minimal Remote wiring**

Parse both retained event names into `EntryChangeEventV1`, call the coordinator once, and remove direct `invalidateQueries`, `refreshUnread`, and `refreshCollections` calls from event handlers. Track whether the handler was previously disconnected; on the next `ready`, call `handleReconnect()` once. Update runtime mutation methods to return the complete response envelope and hand `changeSet` to `handle(..., "response")`; delegate unread mutation settlement to reason=`read` with the returned entry IDs.

- [ ] **Step 4: Run store tests and typecheck**

Run: `pnpm --filter @suhui/store exec vitest run src/remote/sse-handler.test.ts src/modules/unread/invalidate-entries.test.ts src/modules/entry/change-invalidation.test.ts`

Expected: PASS; refresh collections count is `0`, duplicate invalidation count is `1`, reconnect compensation count is `1`.

Run: `pnpm --filter @suhui/store typecheck`

Expected: PASS.

- [ ] **Step 5: Record task evidence**

```yaml
task_anchor: T-004
source_ac: [AC-4, AC-6]
design_anchors: [D-007, D-013]
test_cases: [TC-4, TC-6]
commands_run:
  - pnpm --filter @suhui/store exec vitest run src/remote/sse-handler.test.ts src/modules/unread/invalidate-entries.test.ts src/modules/entry/change-invalidation.test.ts: PASS
  - pnpm --filter @suhui/store typecheck: PASS
evidence_summary: Remote response, SSE, read, subscription, import, and reconnect paths use one reason-aware coordinator
remaining_risk: production metric sampling remains in child plan 06
```

## Plan-Level Verification

- [ ] Run all focused suites:

```bash
pnpm --filter @suhui/electron-main exec vitest run \
  src/manager/local-feed-refresh-events.test.ts \
  src/ipc/services/db.test.ts \
  src/remote/manager.test.ts
pnpm --filter @suhui/store exec vitest run \
  src/modules/entry/change-invalidation.test.ts \
  src/remote/sse-handler.test.ts \
  src/modules/unread/invalidate-entries.test.ts
pnpm --filter @suhui/web exec vitest run \
  src/lib/local-feed-refresh-sync.test.ts \
  src/modules/entry-column/layouts/entry-refresh.test.ts
```

Expected: all suites PASS; explicit assertions show event count `1`, active intersecting refetch count `<=1`, total query reload work `O(N)` or lower for 1/10/50 feeds, and zero ordinary-refresh collection reloads.

- [ ] Run typechecks:

```bash
pnpm --filter @suhui/store typecheck
pnpm --filter @suhui/web typecheck
pnpm --filter @suhui/electron-main typecheck
```

Expected: store/web PASS. Electron main PASS or a fresh, exact historical baseline-blocked record; no new error may be hidden by the baseline.

- [ ] Run caller proof and negative assertions from the Surface Inventory.

Expected: current event names remain, cumulative/per-feed reload paths are absent, ordinary refresh does not refresh collections/subscriptions, and no DB/schema/config/user-owned file changed.

- [ ] Capture a refresh evidence table from automated tests:

| feeds | successful |     failed |            main events | active entry refetches | unread refetches | collection refetches |
| ----: | ---------: | ---------: | ---------------------: | ---------------------: | ---------------: | -------------------: |
|     1 | test value | test value | 1 or 0 when all failed |                    <=1 |              <=1 |        0 for refresh |
|    10 | test value | test value | 1 or 0 when all failed |                    <=1 |              <=1 |        0 for refresh |
|    50 | test value | test value | 1 or 0 when all failed |                    <=1 |              <=1 |        0 for refresh |

- [ ] Run plan-level `final-review`, update `.loopx/multi-plan/suhui-performance-refactor/state.json` fields `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review`, then create one implementation commit only if the review is clean.

## Execution Handoff

Package mode is primary and executes this plan after child plans 01 and 02 according to `00-overview.md`:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md
```

Inline package fallback:

```text
$exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md
```

Direct targeted/resume execution only:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/03-refresh-changesets.md
$exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/03-refresh-changesets.md
```

Do not stage or commit per task. After all four tasks and plan-level review pass, create one child-plan implementation commit; package execution then advances to `04-remote-progressive-bootstrap.md`.
