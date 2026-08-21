# Suhui Desktop 与 Remote 性能重构 Implementation Plan Package

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this package child-plan-by-child-plan. Package mode executes children strictly sequentially and uses checkbox (`- [ ]`) tracking inside each child.

**Source:** `docs/loopx/design/2026-07-13-suhui-performance-refactor/需求设计文档.md`

**Goal:** 在不改变 PostgreSQL 持久化设计和现有基础技术栈的前提下，使 Desktop 与 Remote 的首屏、列表、刷新同步、侧栏渲染和打包验证具备明确的有界成本与生产构建 P95 门禁。

**Architecture:** Electron main application 层提供唯一的条目列表/详情查询语义，IPC 与 HTTP 只做 transport adaptation；React Query 拥有分页成员关系，normalized store 只合并 summary/detail 实体。启动、刷新、Remote bootstrap、侧栏和依赖图在后续子计划中依次切换到有界、可观测、可重试的路径，最后由固定 fixture 的 production 性能 harness 与 Forge artifact guard 统一验收。

**Tech Stack:** TypeScript, Electron, React, React Query, Zustand-style normalized store, Drizzle, PostgreSQL, IPC, HTTP/SSE, Vite, Vitest, Electron Forge, pnpm.

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

## Package Coordination

- **Package slug:** `suhui-performance-refactor`
- **Local state path:** `.loopx/multi-plan/suhui-performance-refactor/state.json`
- **Commit boundary:** one implementation commit after each child plan completes and its plan-level review passes; tasks never stage or commit individually.
- **Execution rule:** package mode executes child plans strictly sequentially, even where logical parallelism is listed below.
- **Direct child execution:** permitted only for targeted, resume, or manual-control work; the executor must still honor dependencies and package state.

## Child Plans And Split Rationale

| Order | Child plan                                                                                     | Why this is a separate executable boundary                                                                                                                               | Depends on           |
| ----- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 1     | `docs/loopx/plans/2026-07-13-suhui-performance-refactor/01-entry-query-and-transports.md`      | Establishes the bounded query, cursor, projection, IPC/HTTP compatibility, page ownership, and summary/detail merge vertical slice that all later loading work consumes. | none                 |
| 2     | `docs/loopx/plans/2026-07-13-suhui-performance-refactor/02-desktop-hydration-and-readiness.md` | Removes unbounded Desktop startup hydration only after the page/detail path exists, while preserving snapshot, dirty-write, deep-link, and `interactive` semantics.      | plan 01              |
| 3     | `docs/loopx/plans/2026-07-13-suhui-performance-refactor/03-refresh-changesets.md`              | Changes producer and consumers together around one versioned ChangeSet and one invalidation coordinator, preventing a half-migrated duplicate-refetch state.             | plan 01              |
| 4     | `docs/loopx/plans/2026-07-13-suhui-performance-refactor/04-remote-progressive-bootstrap.md`    | Makes the Remote shell mount before metadata, uses atomic bootstrap metadata and independent paged entries, and replaces JS unread aggregation without changing schema.  | plans 01 and 03      |
| 5     | `docs/loopx/plans/2026-07-13-suhui-performance-refactor/05-renderer-startup-and-sidebar.md`    | Optimizes renderer dependency boundaries and subscription rendering after data ownership/readiness contracts stabilize, preserving all interaction behavior.             | plans 01, 02, and 04 |
| 6     | `docs/loopx/plans/2026-07-13-suhui-performance-refactor/06-performance-and-packaging-gates.md` | Adds reproducible fixtures, production cold/warm statistics, observability, DB stop evidence, and real artifact assertions as the final completion gate.                 | plans 01-05          |

## Interfaces Between Child Plans

| Producer | Produced contract                                                                                                                                                                      | Consumers                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| plan 01  | `EntryListQuery`, `EntrySummaryPage`, opaque cursor helpers, `DetailVisibilityPolicy`, `EntryQueryService`, `db.listEntries`, bounded `/api/entries`, projection-aware page/store APIs | plans 02, 03, 04, 05, 06        |
| plan 02  | bounded startup snapshot/window, `route_scope_ready_ms`, `desktop_initial_entries_ready_ms`, preserved `interactive` definition                                                        | plans 05 and 06                 |
| plan 03  | `EntryChangeEventV1`, shared invalidation coordinator, `batchId` response/event dedupe, reason matrix                                                                                  | plans 04 and 06                 |
| plan 04  | mount-first Remote bootstrap state, atomic metadata hydration, independent initial entries state, Remote readiness/error metrics                                                       | plans 05 and 06                 |
| plan 05  | measured lazy boundaries, debug-log gate, sidebar render evidence and optional behavior-safe virtualization result                                                                     | plan 06                         |
| plan 06  | fixture manifest, raw samples, P50/P95/max report, SQL/EXPLAIN evidence, bundle/payload/event/render metrics, Forge artifact evidence                                                  | package final review and finish |

## Execution Order And Logical Parallelism

The supported package execution order is `01 -> 02 -> 03 -> 04 -> 05 -> 06`. After plan 01, plans 02 and 03 are logically independent enough for separate branches, and after plan 04 parts of plan 05 measurement work can be prepared alongside plan 06 harness scaffolding. Package mode deliberately does not exploit that logical parallelism: it runs one child at a time so every child starts from a reviewed, committed boundary and the package state remains resumable.

## Source Coverage Map

| Source anchor                                                   | Primary child coverage | Package gate                                  |
| --------------------------------------------------------------- | ---------------------- | --------------------------------------------- |
| `AC-1`, `AC-2`; `D-001`-`D-005`; `TC-1`, `TC-2`                 | plan 01                | plan 06 payload/query/performance evidence    |
| `AC-3`; `D-003`, `D-005`, `D-006`; `TC-3`                       | plan 02                | plan 06 Desktop production fixture evidence   |
| `AC-4`; `D-007`, `D-013`; `TC-4`                                | plan 03                | plan 06 refresh event/refetch report          |
| `AC-5`; `D-008`, `D-013`; `TC-5`                                | plan 04                | plan 06 Remote cold/warm and failure evidence |
| `AC-6`, `AC-7`; `D-009`, `D-010`                                | plan 05                | plan 06 P95 and bundle/render evidence        |
| `AC-6`, `AC-7`, `AC-8`, `AC-9`; `D-011`-`D-014`; `TC-6`, `TC-7` | plan 06                | package final review                          |

## Package Review And State Protocol

After each child plan:

1. Run its focused and plan-level verification commands and record durable evidence using the loopx evidence contract.
2. Run plan-level `final-review`; child-plan review does not create a separate final-review report artifact.
3. Update `.loopx/multi-plan/suhui-performance-refactor/state.json` with at least `plan_review.status`, `plan_review.reviewed_at`, `plan_review.summary`, and `ready_for_spec_review`.
4. Create exactly one implementation commit only after the child is clean and reviewed.
5. Stop instead of continuing if a compatibility surface cannot be preserved, a required external caller is discovered, or a database index/schema change becomes necessary.

After all children are ready, package mode runs one spec-level `final-review` against the source design and complete implementation range. Only a clean spec-level review may enter `finish`.

## Package-Level Negative Assertions

Run these during child and final review; strict current product paths must remain clean:

```bash
rg -n 'db\.getEntries|getEntriesToHydrate|SELECT \*' \
  apps/desktop/layer/main packages/internal/store apps/desktop/layer/renderer/src
rg -n 'content|readabilityContent|readabilityUpdatedAt' \
  apps/desktop/layer/main/src/application/entry packages/internal/store/src/modules/entry
rg -n 'resources/rsshub' apps/desktop/forge.config.cts apps/desktop/scripts
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema*' '.gitignore' '.vscode/settings.json'
```

Expected: no production caller uses deprecated unbounded entry reads or startup full-entry hydration; list projection tests prove the forbidden body fields are absent rather than relying only on text search; RSSHub appears only in explicit ignore/guard coverage; no migration/schema/config-precedence file is changed; the user's `.gitignore` and `.vscode/settings.json` edits remain untouched.

## Package Execution Handoff

Recommended package execution:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md
```

Inline fallback:

```text
$exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md
```

Direct child execution is only for targeted/resume/manual-control runs, for example:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/01-entry-query-and-transports.md
```
