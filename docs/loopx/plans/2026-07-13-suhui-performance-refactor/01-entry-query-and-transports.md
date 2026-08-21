# Bounded Entry Query And Transports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/2026-07-13-suhui-performance-refactor/需求设计文档.md`

**Goal:** Replace every supported Desktop and Remote entry-list production path with one bounded, deterministic summary query and make React Query own cursor pages while the normalized store merges summary/detail projections safely.

**Architecture:** Electron main owns `EntryQueryService`; IPC and HTTP normalize transport inputs and adapt envelopes without reimplementing filtering, ordering, or slicing. Renderer runtime clients return the server page contract, React Query owns membership/order/cursors, and the entry store records projection completeness so a late summary cannot erase a loaded detail.

**Tech Stack:** TypeScript, Electron IPC, Node HTTP, Drizzle, PostgreSQL, React Query, Zustand-style normalized store, Vitest, pnpm.

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

- This is child plan 01 and has no child-plan dependency.
- It produces the query/page/detail interfaces consumed by child plans 02-06.
- Tasks do not stage or commit. After all tasks and plan-level review pass, create exactly one implementation commit for this child plan.
- If a supported repository-external caller is found to require an unbounded/full-body `GET /api/entries` response, stop and return to `spec`; do not restore an unbounded compatibility branch.

## File Structure

| Path                                                                                  | Action | Responsibility                                                                                                                       |
| ------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/desktop/layer/main/src/application/entry/query-types.ts`                        | Create | Main-owned query, summary, detail-policy, page, and typed error contracts.                                                           |
| `apps/desktop/layer/main/src/application/entry/query-cursor.ts`                       | Create | Versioned base64url cursor validation/encoding and three-field keyset predicate helper.                                              |
| `apps/desktop/layer/main/src/application/entry/query-service.ts`                      | Create | The only production entry list/detail semantics: scope normalization, SQL filtering/projection/order/limit, and visibility policies. |
| `apps/desktop/layer/main/src/application/entry/query-service.test.ts`                 | Create | Characterization and contract tests for D-001/D-002/D-003.                                                                           |
| `apps/desktop/layer/main/src/application/entry/service.ts`                            | Modify | Retain entry mutations and delegate compatible reads to `entryQueryService`.                                                         |
| `apps/desktop/layer/main/src/application/agent/service.ts`                            | Modify | Keep agent DTO/envelope but reuse the shared query service and `active-relations` detail policy.                                     |
| `apps/desktop/layer/main/src/application/agent/service.test.ts`                       | Modify | Prove agent DTO compatibility after query-core migration.                                                                            |
| `apps/desktop/layer/main/src/ipc/services/db.ts`                                      | Modify | Add `db.listEntries`, delegate `db.getEntry`, and reduce deprecated `db.getEntries` to a bounded summary wrapper.                    |
| `apps/desktop/layer/main/src/ipc/services/db.test.ts`                                 | Modify | Prove IPC argument/error/policy mapping and bounded deprecated wrapper behavior.                                                     |
| `apps/desktop/layer/main/src/remote/manager.ts`                                       | Modify | Normalize all `/api/entries` scopes/filters/cursors, return `{data,page}`, and use explicit detail policy for detail/PDF.            |
| `apps/desktop/layer/main/src/remote/manager.test.ts`                                  | Modify | Prove HTTP compatibility, invalid-parameter errors, pagination, detail policy, and IPC/HTTP normalized parity.                       |
| `packages/internal/store/src/modules/entry/types.ts`                                  | Modify | Add renderer page/projection types and replace timestamp `pageParam` with opaque cursor.                                             |
| `packages/internal/store/src/runtime/client.ts`                                       | Modify | Send one normalized paged request through IPC or HTTP and return `RuntimeEntrySummaryPage`.                                          |
| `packages/internal/store/src/runtime/client.test.ts`                                  | Modify | Prove multi-feed transport, page envelope, default/next cursor, and no client-side filtering/slicing.                                |
| `packages/internal/store/src/modules/entry/store.ts`                                  | Modify | Add `upsertSummaries`, `upsertDetails`, explicit detail-loaded state, and page-returning fetch services.                             |
| `packages/internal/store/src/modules/entry/store.projection.test.ts`                  | Create | Prove summary/detail arrival order, empty-body detail, optimistic read, and dirty-field reconciliation.                              |
| `packages/internal/store/src/modules/entry/hooks.ts`                                  | Modify | Use `page.nextCursor`; page data owns IDs/order/hasMore.                                                                             |
| `packages/internal/store/src/modules/entry/hooks.test.ts`                             | Modify | Prove page-ID derivation and opaque cursor continuation.                                                                             |
| `apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.ts`      | Modify | Replace local normalized-store slicing with the shared infinite query for every supported route scope.                               |
| `apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.test.ts` | Create | Prove route-to-query mapping, first/next page behavior, unread handling, and no local fake pagination.                               |
| `apps/desktop/layer/renderer/src/lib/query-client.ts`                                 | Modify | Add a persisted-query contract buster so timestamp-cursor pages are discarded.                                                       |
| `apps/desktop/layer/renderer/src/lib/query-client.test.ts`                            | Create | Prove old persisted entry pages cannot restore under the new buster.                                                                 |
| `apps/desktop/layer/main/src/remote/shell.ts`                                         | Modify | Make the fallback shell consume bounded pages and follow `page.nextCursor`.                                                          |

## Interfaces

The implementation must preserve these exact contracts:

```ts
type EntryListScope =
  | { kind: "timeline"; view?: number; excludePrivate?: boolean }
  | { kind: "feeds"; feedIds: string[] }
  | { kind: "list"; listId: string }
  | { kind: "inbox"; inboxId: string }
  | { kind: "collection"; view?: number }

type EntryListQuery = {
  scope: EntryListScope
  read?: boolean
  limit?: number
  cursor?: string
}

type EntryCursorV1 = {
  v: 1
  publishedAt: number
  insertedAt: number
  id: string
}

type EntrySummaryPage = {
  items: EntrySummary[]
  page: { limit: number; hasMore: boolean; nextCursor: string | null }
}

type DetailVisibilityPolicy = "desktop-non-deleted" | "active-relations"

interface EntryQueryService {
  list(query: EntryListQuery): Promise<EntrySummaryPage>
  getDetail(entryId: string, policy: DetailVisibilityPolicy): Promise<EntryDetail | null>
}
```

`EntrySummary` is an allowlist with `recordKind: "summary"` and only:

```text
id,title,url,description,guid,author,authorUrl,authorAvatar,insertedAt,publishedAt,
media,categories,attachments,language,feedId,inboxHandle,read,sources,recordKind
```

`RuntimeEntrySummaryPage` is the renderer model equivalent:

```ts
type RuntimeEntrySummaryPage = {
  items: EntryModel[]
  page: { limit: number; hasMore: boolean; nextCursor: string | null }
}
```

The HTTP envelope remains:

```ts
type RemoteEntryListResponse = {
  data: EntrySummary[]
  page: { limit: number; hasMore: boolean; nextCursor: string | null }
}
```

The new IPC surface is exactly `ipc.invoke("db.listEntries", query) -> EntrySummaryPage`. The deprecated `ipc.invoke("db.getEntries", feedId?)` remains callable but returns only the first summary page with `limit: 100`; repository production callers must be zero after this plan.

## Surface Inventory And Compatibility Proof

| Surface                                | Current behavior                                                                 | Required result                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `db.getEntries(feedId?)`               | Unbounded full rows; renderer filters/sorts/slices.                              | Deprecated bounded wrapper only; no production caller.                         |
| `db.getEntry(id)`                      | Non-deleted row.                                                                 | Shared detail service with `desktop-non-deleted`.                              |
| `GET /api/entries`                     | `{data}` with unbounded rows and only `feedId/unreadOnly`.                       | Same URI/method and `data`, additive `page`, all list paths bounded summaries. |
| `GET /api/entries/:id` and `/:id/pdf`  | Active relation visibility through current app service.                          | Same external behavior using `active-relations`.                               |
| `/api/agent/entries` and agent CLI DTO | Agent-specific `{data:{items,page}}`/DTO.                                        | DTO and route remain unchanged; query semantics/core are shared.               |
| `runtimeClient.entries.list`           | Returns `EntryModel[]`; performs JS filtering, sorting, fake cursor and slicing. | Returns `RuntimeEntrySummaryPage`; adapters only serialize/transform.          |
| `useEntriesByView`                     | Reads normalized store membership and slices 30-row fake pages.                  | Uses React Query page membership/order for Desktop and Remote.                 |
| entry store                            | Whole-object overwrite; body truthiness means detail loaded.                     | Projection-aware merge and explicit detail-loaded state.                       |

Current-source caller proof before editing:

```bash
rg -n 'db\.getEntries|getEntries:|ipc\.invoke\("db\.getEntries"|runtimeClient\.entries\.list|useLocalEntries|getNextPageParam' \
  apps/desktop/layer/main packages/internal/store apps/desktop/layer/renderer/src
rg -n 'GET /api/entries|/api/entries|fetchRemoteEntries|fetchDesktopEntries' \
  apps/desktop/layer/main packages/internal/store apps/desktop/layer/renderer/src
```

Historical paths under `docs/`, `.loopx/`, changelogs, and release notes are excluded from caller proof. After migration, strict production paths must satisfy:

```bash
test "$(rg -n 'ipc\.invoke\("db\.getEntries"|\.getEntries\(' packages/internal/store apps/desktop/layer/renderer/src | wc -l | tr -d ' ')" = "0"
test "$(rg -n 'getEntriesToHydrate' apps/desktop/layer/main packages/internal/store apps/desktop/layer/renderer/src | wc -l | tr -d ' ')" = "1"
rg -n 'db\.listEntries|page\.nextCursor|recordKind' \
  apps/desktop/layer/main packages/internal/store apps/desktop/layer/renderer/src
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*'
```

Expected: no renderer/store production caller uses `db.getEntries`; the sole remaining `getEntriesToHydrate` definition is removed by child plan 02 and is not called here; new page contracts have current callers; no migration/schema file changed. DTO tests, not text search alone, must assert list objects do not own `content`, `readabilityContent`, or `readabilityUpdatedAt`.

### T-001 / Task 1: Characterize And Implement The Shared Query Service

**Files:**

- Create: `apps/desktop/layer/main/src/application/entry/query-types.ts`
- Create: `apps/desktop/layer/main/src/application/entry/query-cursor.ts`
- Create: `apps/desktop/layer/main/src/application/entry/query-service.ts`
- Create: `apps/desktop/layer/main/src/application/entry/query-service.test.ts`
- Modify: `apps/desktop/layer/main/src/application/entry/service.ts`
- Modify: `apps/desktop/layer/main/src/application/agent/service.ts`
- Modify: `apps/desktop/layer/main/src/application/agent/service.test.ts`

**Interfaces:**

- Consumes: existing `DBManager.getDB()`, Drizzle `entriesTable`, active subscription metadata, and existing agent DTO mappers.
- Produces: `EntryListScope`, `EntryListQuery`, `EntrySummary`, `EntrySummaryPage`, `EntryDetail`, `EntryQueryError`, `DetailVisibilityPolicy`, `encodeEntryCursor`, `decodeEntryCursor`, `createEntryCursorWhere`, and singleton `entryQueryService: EntryQueryService`.

**Traceability:**

- Source AC: `AC-1`, `AC-2`, `AC-3`
- Design anchors: `D-001`, `D-002`, `D-003`, `D-014`
- Test cases: `TC-1`, `TC-2`, `TC-3`; `TC-6` query SQL/payload evidence is completed by child plan 06.
- Task anchor: `T-001`

**Expected execution evidence:**

- `commands_run`: `pnpm --filter @suhui/electron-main exec vitest run src/application/entry/query-service.test.ts src/application/agent/service.test.ts`; `pnpm --filter @suhui/electron-main typecheck`; migration/schema diff search.
- `evidence_summary`: tests show `limit+1`, exact three-field order/cursor, scope normalization, `IS NOT TRUE`, summary allowlist, both detail policies, empty-page behavior, invalid input codes, and unchanged agent DTOs.
- `remaining_risk`: representative production `EXPLAIN (ANALYZE, BUFFERS)` remains a child-plan-06 gate; if it proves an index/schema requirement, D-014 stops execution.

**Review focus:**

- Verify adapters cannot bypass the single service by calling `entriesTable.findMany` for production list reads.
- Verify SQL applies scope, visibility, deleted filter, read filter, cursor, projection, order, and `limit+1` before rows cross the DB boundary.
- Verify `read=false` uses `IS NOT TRUE`, invalid limits are rejected rather than clamped, and cursor JSON includes `v: 1`.
- Verify Desktop detail is not narrowed to active relations and Remote/agent detail is not widened.
- Verify no schema/index/migration/config-precedence change was introduced.

**Support lenses:** `api-designer`, `architecture-designer`, `sql-style`

- [ ] **Step 1: Write failing cursor, query, projection, scope, and detail-policy tests**

Add table-driven cases that express the contract directly:

```ts
it.each([0, 101, 1.5, "abc", Number.NaN])("rejects invalid limit %p", async (limit) => {
  await expect(
    entryQueryService.list({ scope: { kind: "timeline" }, limit: limit as number }),
  ).rejects.toMatchObject({ code: "SUHUI_INVALID_LIMIT", statusCode: 400 })
})

it("uses a versioned opaque three-field cursor and strict next-page order", async () => {
  const cursor = encodeEntryCursor({ v: 1, publishedAt: 10, insertedAt: 10, id: "b" })
  expect(decodeEntryCursor(cursor)).toEqual({ v: 1, publishedAt: 10, insertedAt: 10, id: "b" })
  const page = await entryQueryService.list({
    scope: { kind: "feeds", feedIds: [" f1 ", "f1"] },
    limit: 2,
    cursor,
  })
  expect(page.page).toEqual({ limit: 2, hasMore: true, nextCursor: expect.any(String) })
  expect(page.items.map(({ id }) => id)).toEqual(["a", "z"])
})

it("normalizes NULL read to unread and excludes all body fields", async () => {
  const page = await entryQueryService.list({ scope: { kind: "timeline" }, read: false })
  expect(page.items[0]?.read).toBe(false)
  expect(page.items[0]).not.toHaveProperty("content")
  expect(page.items[0]).not.toHaveProperty("readabilityContent")
  expect(page.items[0]).not.toHaveProperty("readabilityUpdatedAt")
  expect(page.items[0]?.recordKind).toBe("summary")
})

it("keeps desktop non-deleted detail while active-relations rejects inactive detail", async () => {
  await expect(
    entryQueryService.getDetail("pending-entry", "desktop-non-deleted"),
  ).resolves.toMatchObject({ id: "pending-entry", recordKind: "detail" })
  await expect(entryQueryService.getDetail("pending-entry", "active-relations")).resolves.toBeNull()
})
```

Also cover empty `feedIds` returning `{items:[],page:{limit,hasMore:false,nextCursor:null}}`, list/inbox/collection/timeline scopes, `excludePrivate` only on timeline, same timestamps resolved by `id DESC`, last page, invalid cursor/version, concurrent newer insertion not appearing in the older next page, and legal empty detail content still returning `recordKind: "detail"`.

- [ ] **Step 2: Run the focused tests and confirm the characterization is red**

Run:

```bash
pnpm --filter @suhui/electron-main exec vitest run \
  src/application/entry/query-service.test.ts \
  src/application/agent/service.test.ts
```

Expected: FAIL because the new query types/service/cursor and policy-specific behavior do not exist; existing agent clamping/independent query behavior should also fail the new compatibility assertions.

- [ ] **Step 3: Implement the cursor and typed validation contracts**

Implement constants and errors exactly:

```ts
export const entryListDefaultLimit = 20
export const entryListMaxLimit = 100

export class EntryQueryError extends Error {
  constructor(
    readonly code:
      | "SUHUI_INVALID_ENTRY_SCOPE"
      | "SUHUI_INVALID_LIMIT"
      | "SUHUI_INVALID_CURSOR"
      | "SUHUI_INVALID_READ_FILTER",
    message: string,
    readonly statusCode = 400,
  ) {
    super(message)
    this.name = "EntryQueryError"
  }
}
```

`normalizeEntryListLimit` must return 20 only for missing input and throw unless the supplied value is a finite integer from 1 through 100. `decodeEntryCursor` must reject malformed base64url, non-object JSON, any version other than 1, non-finite timestamps, or empty IDs.

- [ ] **Step 4: Implement SQL-first `EntryQueryService` with an explicit summary projection**

Use `and/or/eq/lt/inArray/isNull/sql` conditions, the existing active subscription metadata, and one `findMany` call with this invariant shape:

```ts
const rows = await db.query.entriesTable.findMany({
  where: (entries) =>
    and(
      isNull(entries.deletedAt),
      visibilityWhere,
      scopeWhere,
      query.read === false
        ? sql`${entries.read} IS NOT TRUE`
        : query.read === true
          ? eq(entries.read, true)
          : undefined,
      createEntryCursorWhere(entries, decodedCursor),
    ),
  orderBy: (entries, { desc }) => [
    desc(entries.publishedAt),
    desc(entries.insertedAt),
    desc(entries.id),
  ],
  columns: entrySummaryColumns,
  limit: limit + 1,
})
```

Define `entrySummaryColumns` as an explicit true/false projection; it must set `content`, `readabilityContent`, and `readabilityUpdatedAt` to `false`. Normalize `feedIds` by trim/de-duplicate and return an empty page for an empty normalized list. Build `nextCursor` from the last retained item only when `hasMore` is true. Do not run `count`, do not `SELECT *`, and do not apply a second JS visibility/filter pass.

- [ ] **Step 5: Implement detail policies and migrate the agent compatibility adapter**

`getDetail(id, "desktop-non-deleted")` applies only `deletedAt IS NULL`. `getDetail(id, "active-relations")` applies deleted plus active feed/list/inbox relation visibility. Map every returned detail to `recordKind: "detail"`, including an entry whose content fields are all empty.

Keep `/api/agent/entries`, existing unversioned agent cursor input, `AgentEntryListItem`, `AgentEntriesListResult`, `AgentEntryDetail`, and CLI-facing values unchanged. Decode an incoming agent cursor with the existing agent codec, translate it to the service's version-1 cursor, call `entryQueryService.list`/`getDetail(..., "active-relations")`, then apply only the existing agent DTO mapping (`feedTitle`, ISO timestamps, optional description summary, content priority). The returned cursor remains opaque to callers; do not change the agent envelope or reject a cursor emitted by the immediately previous application version.

- [ ] **Step 6: Run focused tests, typecheck, and database-scope guard**

Run:

```bash
pnpm --filter @suhui/electron-main exec vitest run \
  src/application/entry/query-service.test.ts \
  src/application/agent/service.test.ts
pnpm --filter @suhui/electron-main typecheck
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*'
```

Expected: focused tests PASS. Typecheck PASS, or record the fresh pre-existing `rootDir`/file-list diagnostic with proof that this task introduced no new error. The diff guard prints nothing.

- [ ] **Step 7: Record task evidence**

```yaml
task_anchor: T-001
source_ac: [AC-1, AC-2, AC-3]
design_anchors: [D-001, D-002, D-003, D-014]
test_cases: [TC-1, TC-2, TC-3]
commands_run:
  - pnpm --filter @suhui/electron-main exec vitest run src/application/entry/query-service.test.ts src/application/agent/service.test.ts: PASS
  - pnpm --filter @suhui/electron-main typecheck: PASS or documented pre-existing blocker
  - migration/schema diff guard: clean
evidence_summary: one SQL-first service enforces bounded summary pages, stable cursor order, NULL unread semantics, and explicit detail policies while preserving agent DTOs
remaining_risk: production EXPLAIN and P95 evidence deferred to child plan 06 under D-014
```

### T-002 / Task 2: Migrate IPC And HTTP Without Reintroducing An Unbounded Compatibility Path

**Files:**

- Modify: `apps/desktop/layer/main/src/ipc/services/db.ts`
- Modify: `apps/desktop/layer/main/src/ipc/services/db.test.ts`
- Modify: `apps/desktop/layer/main/src/remote/manager.ts`
- Modify: `apps/desktop/layer/main/src/remote/manager.test.ts`
- Modify: `apps/desktop/layer/main/src/remote/shell.ts`

**Interfaces:**

- Consumes: `entryQueryService.list`, `entryQueryService.getDetail`, `EntryListQuery`, `EntryQueryError`, and cursor/page contracts from T-001.
- Produces: `db.listEntries(query) -> EntrySummaryPage`; deprecated bounded `db.getEntries(feedId?)`; `GET /api/entries -> {data,page}`; unchanged detail/PDF routes using `active-relations`; fallback shell cursor consumption.

**Traceability:**

- Source AC: `AC-1`, `AC-2`
- Design anchors: `D-001`, `D-002`, `D-003`, `D-004`, `D-014`
- Test cases: `TC-1`, `TC-2`; detail/PDF part of `TC-3`; `TC-6` payload/SQL measurements deferred to child plan 06.
- Task anchor: `T-002`

**Expected execution evidence:**

- `commands_run`: focused main Vitest command, IPC/HTTP caller-proof searches, forbidden-list-field assertions, typecheck, schema diff guard.
- `evidence_summary`: equivalent normalized inputs produce identical items/page semantics through IPC and HTTP; routes/method/data remain compatible; every HTTP list path is bounded; typed 400/500 errors do not leak internals.
- `remaining_risk`: repository-external caller discovery remains a stop condition requiring `spec`.

**Review focus:**

- Verify HTTP parsing rejects conflicting scopes and read filters with stable codes and never chooses a hidden legacy full-list branch.
- Verify repeated `feedId` query parameters preserve multi-feed semantics; empty feed IDs do not become All.
- Verify deprecated IPC wrapper is limited to 100 summary records and has no current production caller.
- Verify Remote detail and PDF share `active-relations`; Desktop `db.getEntry` uses `desktop-non-deleted`.
- Verify generic 500 responses omit SQL, body, filesystem paths, connection strings, and raw errors.

**Support lenses:** `api-designer`, `architecture-designer`, `sql-style`

- [ ] **Step 1: Write failing IPC/HTTP contract and parity tests**

Add tests with injected query-service spies:

```ts
it("maps db.listEntries directly and keeps deprecated getEntries bounded", async () => {
  const page = await service.listEntries(context, { scope: { kind: "timeline" } })
  expect(queryList).toHaveBeenCalledWith({ scope: { kind: "timeline" } })
  expect(page.page.limit).toBe(20)
  await service.getEntries(context, "feed-1")
  expect(queryList).toHaveBeenLastCalledWith({
    scope: { kind: "feeds", feedIds: ["feed-1"] },
    limit: 100,
  })
})

it("returns a bounded additive HTTP page and preserves data", async () => {
  const response = await fetch(`${baseUrl}/api/entries?feedId=f1&feedId=f2&unreadOnly=true&limit=2`)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    data: expect.any(Array),
    page: { limit: 2, hasMore: true, nextCursor: expect.any(String) },
  })
})

it.each([
  ["?feedId=f1&listId=l1", "SUHUI_INVALID_ENTRY_SCOPE"],
  ["?feedId=f1&excludePrivate=true", "SUHUI_INVALID_ENTRY_SCOPE"],
  ["?unreadOnly=true&read=true", "SUHUI_INVALID_READ_FILTER"],
  ["?limit=101", "SUHUI_INVALID_LIMIT"],
  ["?cursor=broken", "SUHUI_INVALID_CURSOR"],
])("returns a stable 400 for %s", async (query, code) => {
  const response = await fetch(`${baseUrl}/api/entries${query}`)
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: { code } })
})
```

Add a parity test that invokes IPC and HTTP with the same normalized query and compares only `{items/page}` semantics after removing the HTTP envelope difference. Keep existing route, PDF, not-found, and agent tests.

- [ ] **Step 2: Run the transport tests and confirm they fail for the current unbounded surfaces**

Run:

```bash
pnpm --filter @suhui/electron-main exec vitest run \
  src/ipc/services/db.test.ts \
  src/remote/manager.test.ts
```

Expected: FAIL because `db.listEntries`, additive `page`, strict parameter errors, multi-feed scopes, and policy delegation are absent.

- [ ] **Step 3: Add the typed IPC adapter and bounded deprecated wrapper**

Implement:

```ts
@IpcMethod()
async listEntries(_context: IpcContext, query: EntryListQuery) {
  await this.waitForDatabase()
  return entryQueryService.list(query)
}

@IpcMethod()
async getEntry(_context: IpcContext, entryId: string) {
  await this.waitForDatabase()
  return entryQueryService.getDetail(entryId, "desktop-non-deleted")
}

@IpcMethod()
async getEntries(_context: IpcContext, feedId?: string) {
  await this.waitForDatabase()
  const result = await entryQueryService.list({
    scope: feedId ? { kind: "feeds", feedIds: [feedId] } : { kind: "timeline" },
    limit: 100,
  })
  return result.items
}
```

Do not add a `listEntries` path that accepts legacy positional arguments; renderer callers must send `EntryListQuery`.

- [ ] **Step 4: Normalize HTTP inputs once and map errors safely**

Introduce a pure parser in `manager.ts` that consumes `URLSearchParams` and returns one `EntryListQuery`. It must handle repeated `feedId`, `view`, `listId`, `inboxId`, `isCollection`, `excludePrivate`, `read`, `unreadOnly`, `limit`, and `cursor` exactly as D-004 specifies. Route implementation:

```ts
if (method === "GET" && url.pathname === "/api/entries") {
  try {
    const result = await deps.listEntries(parseRemoteEntryListQuery(url.searchParams))
    json(response, 200, { data: result.items, page: result.page })
  } catch (error) {
    writeEntryQueryError(response, error)
  }
  return
}
```

`writeEntryQueryError` returns `{error:{code,message}}` and status 400 for `EntryQueryError`; all other errors return a generic 500 code/message without interpolating the raw error. Update `RemoteServerDependencies` from `getEntries(options) -> EntryRecord[]` to `listEntries(query) -> EntrySummaryPage`.

- [ ] **Step 5: Apply explicit detail policies and page the fallback shell**

Default dependencies must call:

```ts
listEntries: (query) => entryQueryService.list(query),
getEntry: (entryId) => entryQueryService.getDetail(entryId, "active-relations"),
```

Both normal detail and PDF continue through the same `getEntry` dependency. Modify fallback shell entry loading to read `response.data` and `response.page.nextCursor`; its “load more” action sends the returned opaque cursor. It must not concatenate repeated page one, infer a timestamp cursor, or request a larger unbounded limit.

- [ ] **Step 6: Run transport tests and surface negative assertions**

Run:

```bash
pnpm --filter @suhui/electron-main exec vitest run \
  src/application/entry/query-service.test.ts \
  src/application/agent/service.test.ts \
  src/ipc/services/db.test.ts \
  src/remote/manager.test.ts
pnpm --filter @suhui/electron-main typecheck
rg -n 'ipc\.invoke\("db\.getEntries"|db\.getEntries' packages/internal/store apps/desktop/layer/renderer/src
rg -n 'slice\(0, limit|new Date\(pageParam\)|publishedAt.*cursor' \
  packages/internal/store/src/runtime/client.ts apps/desktop/layer/main/src/remote/shell.ts
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*'
```

Expected: tests PASS. The first two searches print current renderer/runtime callers only until T-003 migrates them; record the exact list for T-003. The schema guard prints nothing. Typecheck passes or records only the fresh known baseline blocker.

- [ ] **Step 7: Record task evidence**

```yaml
task_anchor: T-002
source_ac: [AC-1, AC-2]
design_anchors: [D-001, D-002, D-003, D-004, D-014]
test_cases: [TC-1, TC-2, TC-3]
commands_run:
  - pnpm --filter @suhui/electron-main exec vitest run src/application/entry/query-service.test.ts src/application/agent/service.test.ts src/ipc/services/db.test.ts src/remote/manager.test.ts: PASS
  - pnpm --filter @suhui/electron-main typecheck: PASS or documented pre-existing blocker
  - transport caller inventory and schema diff guard: recorded; schema clean
evidence_summary: IPC and HTTP are thin adapters over the same bounded service; routes, methods, data, agent DTO, and detail/PDF behavior remain compatible
remaining_risk: current renderer callers are intentionally closed in T-003; external supported caller discovery remains a spec stop condition
```

### T-003 / Task 3: Move Renderer Membership To Query Pages And Make Entity Merges Projection-Aware

**Files:**

- Modify: `packages/internal/store/src/modules/entry/types.ts`
- Modify: `packages/internal/store/src/runtime/client.ts`
- Modify: `packages/internal/store/src/runtime/client.test.ts`
- Modify: `packages/internal/store/src/modules/entry/store.ts`
- Create: `packages/internal/store/src/modules/entry/store.projection.test.ts`
- Modify: `packages/internal/store/src/modules/entry/hooks.ts`
- Modify: `packages/internal/store/src/modules/entry/hooks.test.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.ts`
- Create: `apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.test.ts`
- Create: `apps/desktop/layer/renderer/src/modules/entry-column/hooks/visible-detail-prefetch.ts`
- Create: `apps/desktop/layer/renderer/src/modules/entry-column/hooks/visible-detail-prefetch.test.ts`
- Modify: `apps/desktop/layer/renderer/src/remote/entry-navigation.test.ts`
- Modify: `apps/desktop/layer/renderer/src/lib/query-client.ts`
- Create: `apps/desktop/layer/renderer/src/lib/query-client.test.ts`

**Interfaces:**

- Consumes: `db.listEntries`, HTTP `{data,page}`, opaque `nextCursor`, summary/detail `recordKind`, and unchanged route params/settings.
- Produces: `runtimeClient.entries.list(props) -> RuntimeEntrySummaryPage`; `entryActions.upsertSummaries(entries)`; `entryActions.upsertDetails(entries)`; `entryActions.isDetailLoaded(id)`; `entrySyncServices.fetchEntries -> {data,page}`; `useEntriesByView` backed by `useEntriesQuery` for every Desktop/Remote scope; `createVisibleDetailPrefetchQueue({ concurrency: 4, loadDetail })` for video rows whose summary media fields are insufficient.

**Traceability:**

- Source AC: `AC-1`, `AC-2`, `AC-3`
- Design anchors: `D-003`, `D-004`, `D-005`, `D-014`
- Test cases: `TC-1`, `TC-2`, `TC-3`; usable-list P95 in `TC-6` is completed by child plan 06.
- Task anchor: `T-003`

**Expected execution evidence:**

- `commands_run`: focused store and renderer Vitest commands, including visible-detail request-count and unread automatic-forward regressions; store/renderer typechecks; zero-caller and fake-cursor negative assertions; persisted-cache buster test.
- `evidence_summary`: page order/cursors come from the server; Desktop and Remote share route mapping; summaries never erase body fields; empty details do not refetch forever; video fallback detail work is visible-item-only and capped at four concurrent requests; marking the active unread item still advances to the next query-page member; old timestamp pages cannot restore.
- `remaining_risk`: production usable-list timing is exercised by child plan 06.

**Review focus:**

- Verify query pages, not normalized index sets, own list membership/order/hasMore.
- Verify query keys contain normalized scope/read inputs and cursor is only `pageParam`, preventing filter/cursor reuse.
- Verify `upsertSummaries` preserves loaded detail fields and current optimistic/dirty read state; `upsertDetails` sets explicit completeness even for empty body.
- Verify no Desktop code path performs one IPC call per feed or repeats Remote page one.
- Verify the old persisted timestamp-cursor pages are invalidated through a buster, not parsed heuristically.
- Verify video preview fallback never schedules non-visible rows and never exceeds the explicit concurrency cap of `4`; summary-sufficient rows must schedule no detail request.
- Verify unread optimistic settlement preserves the existing automatic-forward behavior and selects the next ID from flattened React Query page order.

**Support lenses:** `api-designer`, `architecture-designer`

- [ ] **Step 1: Write failing runtime page, merge, hook, route, and cache-buster tests**

Use exact behavioral assertions:

```ts
it("sends one multi-feed query and returns the server page unchanged", async () => {
  const page = await runtimeClient.entries.list({ feedIdList: ["f1", "f2", "f1"], limit: 20 })
  expect(ipc.invoke).toHaveBeenCalledTimes(1)
  expect(ipc.invoke).toHaveBeenCalledWith("db.listEntries", {
    scope: { kind: "feeds", feedIds: ["f1", "f2"] },
    limit: 20,
  })
  expect(page.page.nextCursor).toBe("opaque-next")
})

it("does not erase detail when a summary arrives later", () => {
  entryActions.upsertDetails([{ ...detail, recordKind: "detail", content: "body" }])
  entryActions.upsertSummaries([{ ...summary, recordKind: "summary", title: "new title" }])
  expect(getEntry("e1")).toMatchObject({ title: "new title", content: "body" })
  expect(entryActions.isDetailLoaded("e1")).toBe(true)
})

it("marks an empty body detail loaded", () => {
  entryActions.upsertDetails([
    { ...detail, recordKind: "detail", content: "", readabilityContent: null },
  ])
  expect(entryActions.isDetailLoaded("e1")).toBe(true)
})

it("uses page.nextCursor rather than publishedAt", () => {
  expect(
    getEntryNextPageParam({ data: [], page: { limit: 20, hasMore: true, nextCursor: "opaque" } }),
  ).toBe("opaque")
})
```

Renderer route mapping tests must cover timeline All/view/excludePrivate, one/many feeds, list, inbox, collection, unread-only, route changes resetting pages, deep-link selection not present in the current page, and successful empty page as ready. Query-cache tests must prove a persisted payload written with the old buster is discarded.

Add these exact renderer regressions:

```ts
it("starts at most four visible detail requests and releases the fifth after a slot opens", async () => {
  const requests = deferredDetailRequests()
  const queue = createVisibleDetailPrefetchQueue({ concurrency: 4, loadDetail: requests.load })
  queue.syncVisibleRows(["e1", "e2", "e3", "e4", "e5"].map(insufficientVideo))
  expect(requests.startedIds()).toEqual(["e1", "e2", "e3", "e4"])
  expect(queue.maxObservedConcurrency()).toBe(4)

  requests.resolve("e1")
  await requests.flush()
  expect(requests.startedIds()).toEqual(["e1", "e2", "e3", "e4", "e5"])
})

it("cancels queued detail work when a row leaves the visible set", async () => {
  const requests = deferredDetailRequests()
  const queue = createVisibleDetailPrefetchQueue({ concurrency: 4, loadDetail: requests.load })
  queue.syncVisibleRows(["e1", "e2", "e3", "e4", "offscreen"].map(insufficientVideo))
  expect(requests.startedIds()).not.toContain("offscreen")

  queue.syncVisibleRows(["e1", "e2", "e3", "e4"].map(insufficientVideo))
  requests.resolve("e1")
  await requests.flush()
  expect(requests.startedIds()).not.toContain("offscreen")
})

it("advances after optimistic unread removal using the pre-removal query-page order", async () => {
  const navigation = renderUnreadEntryNavigation({
    pages: [{ data: [summary("e1"), summary("e2"), summary("e3")], page: lastPage }],
    activeId: "e1",
  })
  await navigation.markActiveRead()
  expect(navigation.visibleIds()).toEqual(["e2", "e3"])
  expect(navigation.activeId()).toBe("e2")
  expect(navigation.selectionHistory()).toEqual(["e1", "e2"])
})
```

- [ ] **Step 2: Run focused store/renderer tests and confirm red state**

Run:

```bash
pnpm --filter @suhui/store exec vitest run \
  src/runtime/client.test.ts \
  src/modules/entry/hooks.test.ts \
  src/modules/entry/store.projection.test.ts
pnpm --filter @suhui/web exec vitest run \
  src/modules/entry-column/hooks/useEntriesByView.test.ts \
  src/modules/entry-column/hooks/visible-detail-prefetch.test.ts \
  src/remote/entry-navigation.test.ts \
  src/lib/query-client.test.ts
```

Expected: FAIL because runtime list returns arrays, hooks infer a timestamp, Desktop performs multiple unbounded IPC reads, the store overwrites detail, and the cache has no buster.

- [ ] **Step 3: Replace runtime client-side filtering/sorting/slicing with query serialization**

Add a pure `toEntryListQuery(props)` conversion and call exactly one transport request. Desktop invokes `db.listEntries`; Remote serializes one scope plus `read`, `limit`, and opaque `cursor`. Transform only `result.items`/`response.data` to `EntryModel`, preserve the returned `page`, and delete JS feed filtering, sorting, timestamp filtering, de-duplication, and `slice(0, limit)` from both remote and Desktop paths.

For a local non-IPC test fallback, return a bounded `RuntimeEntrySummaryPage` using the same three-field comparator and an opaque in-memory cursor only as a non-production compatibility fixture; it must never be selected in Electron or Remote runtime.

- [ ] **Step 4: Implement projection-aware entity merge and explicit detail state**

Extend entry state with a set or record whose sole responsibility is explicit detail completeness. Implement:

```ts
upsertSummaries(entries: EntryModel[]) {
  // Merge summary allowlist fields into the existing entity.
  // Preserve content, readabilityContent, readabilityUpdatedAt and current dirty read state.
}

upsertDetails(entries: EntryModel[]) {
  // Merge the complete detail and add each ID to detailLoadedEntryIds.
}

isDetailLoaded(entryId: string) {
  return get().detailLoadedEntryIds.has(entryId)
}
```

`fetchEntries` calls `upsertSummaries` and returns `{data: mappedItems, page}`. `fetchEntryDetail` returns cached data only when `isDetailLoaded(entryId)` is true; otherwise it fetches and calls `upsertDetails`, even if body strings are empty. Preserve existing optimistic read and hydration reconciliation helpers.

- [ ] **Step 5: Make React Query own cursor pages and route membership**

Extract and test:

```ts
export const getEntryNextPageParam = (lastPage: EntryQueryHookPage) =>
  lastPage.page.hasMore ? (lastPage.page.nextCursor ?? undefined) : undefined
```

`deriveEntriesIds` flattens page `data` in response order and de-duplicates IDs without consulting store membership indexes. `useEntriesByView` builds the existing route scope and calls `useEntriesQuery`; delete `useLocalEntries`, `page/pageSize/totalPage`, store-index selection, and debounce-based fake pagination. Preserve unread active-entry inclusion, grouping, reset-on-first-page-fetch, and `unreadSyncService.resetFromRemote()` behavior.

- [ ] **Step 6: Bump persisted query contract and migrate fallback/detail callers**

Set a stable buster in `persistConfig`, for example:

```ts
export const ENTRY_QUERY_PERSIST_BUSTER = "entry-summary-page-v1"
export const persistConfig = {
  persister: localStoragePersister,
  buster: ENTRY_QUERY_PERSIST_BUSTER,
  // existing maxAge and dehydrateOptions remain
}
```

Any caller that decides whether to load detail must use explicit `isDetailLoaded`, not `content || readabilityContent`. Ensure Remote app, Desktop content, prefetch, PDF initiation, and video-preview paths retain their current UI behavior while fetching detail only when required.

For video rows, implement `createVisibleDetailPrefetchQueue` as a small in-memory scheduler with the fixed implementation contract `concurrency: 4`. It accepts only the renderer's current visible-row set, skips rows whose summary `url/attachments/media/description` already determine the preview, cancels queued work when a row leaves the visible set, de-duplicates by entry ID, and calls the ordinary detail path. Detail completion must not participate in usable-list readiness.

Preserve automatic-forward selection by resolving the next entry from the flattened query-page ID order before the optimistic unread filter removes the active item. Reuse the existing navigation helper rather than deriving the next ID from normalized-store membership.

- [ ] **Step 7: Run all focused tests, typechecks, and final surface assertions**

Run:

```bash
pnpm --filter @suhui/store exec vitest run \
  src/runtime/client.test.ts \
  src/modules/entry/hooks.test.ts \
  src/modules/entry/store.projection.test.ts
pnpm --filter @suhui/web exec vitest run \
  src/modules/entry-column/hooks/useEntriesByView.test.ts \
  src/modules/entry-column/hooks/visible-detail-prefetch.test.ts \
  src/remote/entry-navigation.test.ts \
  src/lib/query-client.test.ts
pnpm --filter @suhui/electron-main exec vitest run \
  src/application/entry/query-service.test.ts \
  src/application/agent/service.test.ts \
  src/ipc/services/db.test.ts \
  src/remote/manager.test.ts
pnpm --filter @suhui/store typecheck
pnpm --filter @suhui/web typecheck
pnpm --filter @suhui/electron-main typecheck
test "$(rg -n 'ipc\.invoke\("db\.getEntries"|db\.getEntries' packages/internal/store apps/desktop/layer/renderer/src | wc -l | tr -d ' ')" = "0"
test "$(rg -n 'new Date\(pageParam\)|slice\(0, limit|const pageSize = 30|useLocalEntries' packages/internal/store/src apps/desktop/layer/renderer/src/modules/entry-column/hooks | wc -l | tr -d ' ')" = "0"
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*' '.gitignore' '.vscode/settings.json'
```

Expected: all focused tests PASS; store/web typechecks PASS; main typecheck PASS or only the freshly recorded historical `rootDir`/file-list blocker; both negative assertion commands exit 0; the final diff prints neither migration/schema paths nor `.gitignore`/`.vscode/settings.json`.

- [ ] **Step 8: Record task evidence**

```yaml
task_anchor: T-003
source_ac: [AC-1, AC-2, AC-3]
design_anchors: [D-003, D-004, D-005, D-014]
test_cases: [TC-1, TC-2, TC-3]
commands_run:
  - focused store, renderer, visible-detail concurrency, automatic-forward, and main Vitest suites: PASS
  - @suhui/store and @suhui/web typecheck: PASS
  - @suhui/electron-main typecheck: PASS or documented pre-existing blocker
  - deprecated-caller/fake-cursor/schema/worktree negative assertions: clean
evidence_summary: React Query pages now own list order and continuation; runtime transports are bounded; normalized entities preserve detail and dirty state; visible-only video detail fallback is capped at four requests; unread automatic-forward follows query-page order; old cursor caches are rejected
remaining_risk: production fixture P95, payload bytes, and SQL EXPLAIN remain for child plan 06
```

## Plan-Level Verification

Run after all three tasks:

```bash
pnpm --filter @suhui/electron-main exec vitest run \
  src/application/entry/query-service.test.ts \
  src/application/agent/service.test.ts \
  src/ipc/services/db.test.ts \
  src/remote/manager.test.ts
pnpm --filter @suhui/store exec vitest run \
  src/runtime/client.test.ts \
  src/modules/entry/hooks.test.ts \
  src/modules/entry/store.projection.test.ts
pnpm --filter @suhui/web exec vitest run \
  src/modules/entry-column/hooks/useEntriesByView.test.ts \
  src/modules/entry-column/hooks/visible-detail-prefetch.test.ts \
  src/remote/entry-navigation.test.ts \
  src/lib/query-client.test.ts
pnpm --filter @suhui/store typecheck
pnpm --filter @suhui/web typecheck
pnpm --filter @suhui/electron-main typecheck
pnpm --filter suhui build:electron-vite
test "$(rg -n 'ipc\.invoke\("db\.getEntries"|db\.getEntries|const pageSize = 30|useLocalEntries|new Date\(pageParam\)' packages/internal/store apps/desktop/layer/renderer/src | wc -l | tr -d ' ')" = "0"
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*' '.gitignore' '.vscode/settings.json'
```

Expected: focused suites and production renderer/main build pass; typechecks pass except a freshly evidenced pre-existing main baseline blocker; no deprecated production caller/fake cursor remains; no database design or protected worktree file changed.

Manual/API evidence:

1. Capture IPC and HTTP first/second pages for the same one-feed query and show identical ID order, `hasMore`, and decoded cursor tuple semantics.
2. Capture All, unread including a legacy NULL row, multi-feed, list, inbox, and collection results through both transports.
3. Record serialized list payload bytes and assert every item lacks all three forbidden body fields.
4. Open a Desktop pending/unsubscribed non-deleted deep link and confirm detail is available; request the same inactive detail/PDF through Remote and confirm unavailable behavior is unchanged.
5. Record current-source caller searches and explicitly exclude `docs/`, `.loopx/`, changelogs, and historical release notes.

## Execution Handoff

Use package mode from the overview for normal execution:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md
```

Direct child execution is only for targeted/resume/manual-control work:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/01-entry-query-and-transports.md
$exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/01-entry-query-and-transports.md
```

After task evidence is complete, run plan-level `final-review`, update `.loopx/multi-plan/suhui-performance-refactor/state.json` fields `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review`, then create one implementation commit for this reviewed child plan. Do not stage or commit per task.
