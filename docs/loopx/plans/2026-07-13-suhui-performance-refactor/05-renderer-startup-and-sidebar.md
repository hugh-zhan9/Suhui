# Renderer 启动依赖图与订阅侧栏性能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this child plan. Execute tasks in order, keep checkbox evidence current, and do not stage or commit inside tasks.

**Source:** `docs/loopx/design/2026-07-13-suhui-performance-refactor/需求设计文档.md`

**Goal:** 基于生产 bundle 与 React profiling 证据缩短 Desktop/Remote 首屏关键依赖图，并使 400/800 subscriptions 侧栏在不改变排序、选择、菜单、键盘、焦点和拖拽行为的前提下减少无关计算与渲染。

**Architecture:** 保持现有 React/Electron renderer 架构；主/Remote entry 分别建立可审计的 initial dependency baseline，把非首屏 provider、command implementation 与 Shiki 增强移到 dynamic-import 边界。侧栏先通过稳定 selector、memoized derived model 和细粒度行订阅降低重渲染；只有测量证明 DOM 数是主瓶颈且全部行为 characterization 通过时，才在同一渲染边界内启用虚拟化。

**Tech Stack:** TypeScript, React, React Query, Vitest, Testing Library, Vite/Rollup, Electron renderer, pnpm.

**Support lenses:** `architecture-designer`, `lancet`, `go-style: not_applicable`（本计划不编辑 Go）

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

- Package plans 01, 02, and 04 must already be implemented, verified, reviewed, and committed.
- Plan 01 provides bounded page/detail ownership; plan 02 provides stable Desktop readiness metrics; plan 04 provides mount-first Remote readiness. This plan must not re-open those contracts.
- Plan 06 owns the final production cold/warm P95 gate; this plan must leave bundle and render evidence consumable by that harness.

## File Structure

### Files to modify

- `apps/desktop/layer/renderer/src/providers/root-providers.tsx` — remove static ownership of non-critical provider/command implementations.
- `apps/desktop/layer/renderer/src/providers/lazy/index.ts` — expose browser-compatible lazy provider boundaries.
- `apps/desktop/layer/renderer/src/providers/lazy/index.electron.ts` — expose Electron-specific lazy provider boundaries without leaking them into Remote.
- `apps/desktop/layer/renderer/src/modules/command/command-manager.ts` — retain lightweight registration while loading command implementations on first use.
- `apps/desktop/layer/renderer/src/lib/parse-html.ts` — render ordinary code blocks without statically importing the Shiki implementation.
- `apps/desktop/layer/renderer/src/components/ui/code-highlighter/index.ts` — make the enhanced highlighter an explicit lazy surface.
- `apps/desktop/layer/renderer/src/initialize/index.ts` — preserve stable startup metrics and gate detailed startup-read trace output.
- `apps/desktop/layer/renderer/src/modules/entry-column/index.tsx` — gate hot-path startup-read traces without changing mark-read behavior.
- `apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntryMarkReadHandler.tsx` — gate hot-path startup-read traces without changing batching behavior.
- `apps/desktop/layer/main/src/ipc/services/db.ts` — gate main-process startup-read trace while retaining stable startup metrics.
- `packages/internal/database/src/services/entry.ts` — use the same explicit debug gate for entry patch tracing.
- `apps/desktop/layer/renderer/src/modules/subscription-column/SortedFeedItems.tsx` — consume a stable derived feed ordering model.
- `apps/desktop/layer/renderer/src/modules/subscription-column/FeedCategory.tsx` — isolate category expansion and row subscriptions.
- `apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/SubscriptionList.tsx` — isolate list-level state and, only after the evidence gate, host behavior-safe virtualization.
- `packages/internal/store/src/modules/subscription/hooks.ts` — provide selectors whose identity changes only when the selected subscription/category inputs change.
- `apps/desktop/layer/renderer/src/modules/subscription-column/SortedFeedItems.test.tsx` — preserve ordering and rendering behavior.
- `apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/unread-count.test.ts` — preserve unread totals.
- `apps/desktop/layer/renderer/src/modules/subscription-column/timeline-switch.test.ts` — preserve timeline switching.

### Files to create

- `apps/desktop/layer/renderer/src/modules/subscription-column/sidebar-derived-model.ts` — pure, memoizable category/feed derivation with explicit inputs.
- `apps/desktop/layer/renderer/src/modules/subscription-column/sidebar-derived-model.test.ts` — ordering, visibility, identity, and 800-subscription characterization.
- `apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/interaction-regression.test.tsx` — selection, context menu, keyboard, focus restore, and drag characterization.
- `apps/desktop/layer/renderer/src/components/ui/code-highlighter/lazy-code-highlighter.tsx` — asynchronous enhancement with plain-code fallback and retryable failure boundary.
- `apps/desktop/layer/renderer/src/components/ui/code-highlighter/lazy-code-highlighter.test.tsx` — fallback, success, and failure behavior.
- `apps/desktop/layer/renderer/src/providers/renderer-boundaries.test.ts` — source/manifest-level guard that main and Remote initial graphs do not regain the forbidden static imports.

## Surface Inventory And Caller Proof

| Surface               | Current owner/caller                                           | Required result                                                                      | Proof                                           |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Root provider graph   | `root-providers.tsx` statically imports `FollowCommandManager` | shell-critical providers remain synchronous; non-critical implementation loads later | build graph plus first-use behavior tests       |
| Shiki                 | `parse-html.ts` imports `~/components/ui/code-highlighter`     | plain code block is available immediately; Shiki enhances asynchronously             | lazy highlighter tests and initial-chunk search |
| Desktop/Remote inputs | `vite.electron-render.config.ts` inputs `main` and `remote`    | separate entry budgets; Remote does not import Desktop-only graph                    | analyzer manifest comparison                    |
| Startup trace         | preload flag plus renderer/main `[startup-read-trace]` sites   | detailed trace only under explicit flag; stable `[startup]` metrics remain           | focused tests/search and production smoke       |
| Sidebar ordering      | `SortedFeedItems.tsx`, sort-by modules                         | unread/alphabetical and direction semantics unchanged                                | existing and new pure-model tests               |
| Sidebar interaction   | `FeedCategory.tsx`, `SubscriptionList.tsx`, `FeedItem.tsx`     | selection/menu/keyboard/focus/drag remain equivalent                                 | interaction regression suite                    |

Caller-proof searches to run before and after edits:

```bash
rg -n 'FollowCommandManager|command-manager' apps/desktop/layer/renderer/src
rg -n 'ShikiHighLighter|code-highlighter|plain-shiki|from "shiki"' apps/desktop/layer/renderer/src
rg -n '\[startup-read-trace\]' apps/desktop/layer/main packages/internal/database apps/desktop/layer/renderer/src
rg -n 'SortedFeedItems|FeedCategoryAutoHideUnread|SubscriptionListGuard|useSubscriptionListIds' \
  apps/desktop/layer/renderer/src packages/internal/store/src
```

Negative assertions after implementation:

```bash
! rg -n '^import .*FollowCommandManager' apps/desktop/layer/renderer/src/providers/root-providers.tsx
! rg -n '^import .*code-highlighter' apps/desktop/layer/renderer/src/lib/parse-html.ts
! rg -n '\[startup-read-trace\].*(console\.|appLog\()' \
  apps/desktop/layer/main packages/internal/database apps/desktop/layer/renderer/src \
  | rg -v 'debugStartupReadTrace|startupReadTraceEnabled'
git diff --name-only -- 'apps/**/migrations/**' 'packages/**/migrations/**' '*schema* '.gitignore' '.vscode/settings.json'
```

Expected: no root static command-manager import, no parse-html static highlighter import, every detailed trace site is guarded by the explicit flag, and no database/schema or unrelated user-owned file is changed. Source searches are guards, not substitutes for bundle/behavior tests.

## Exact Interfaces

```ts
export type SidebarSortMode = "unread" | "alphabetical"
export type SidebarSortDirection = "asc" | "desc"

export type SidebarDerivedInput = {
  subscriptionIds: readonly string[]
  categoryBySubscriptionId: Readonly<Record<string, string | null>>
  titleBySubscriptionId: Readonly<Record<string, string>>
  unreadBySubscriptionId: Readonly<Record<string, number>>
  collapsedCategories: ReadonlySet<string>
  sortMode: SidebarSortMode
  sortDirection: SidebarSortDirection
}

export type SidebarDerivedCategory = {
  category: string | null
  subscriptionIds: readonly string[]
  unread: number
  collapsed: boolean
}

export function deriveSidebarModel(input: SidebarDerivedInput): readonly SidebarDerivedCategory[]
```

Identity contract: equal selected inputs must return referentially stable category and feed arrays; unrelated store updates must not invalidate all row props. Sorting/tie-breaking must remain the currently characterized behavior rather than introducing a new rule.

```ts
export type LazyCodeHighlighterProps = {
  code: string
  language?: string
  className?: string
}

export function LazyCodeHighlighter(props: LazyCodeHighlighterProps): JSX.Element
```

The synchronous render is a semantic `<pre><code>` fallback. Enhancement may load after commit; load failure keeps readable code and exposes the existing retry/error mechanism where one exists. It must never remove article text.

```ts
export function isStartupReadTraceEnabled(): boolean
```

This function must use the existing preload/argv debug flag. It does not gate stable `[startup]` metrics or refresh audit logs.

## Tasks

### T-001 / Task 1: Characterize renderer graph and sidebar behavior before optimization

**Files:**

- Modify: `apps/desktop/layer/renderer/src/modules/subscription-column/SortedFeedItems.test.tsx`
- Modify: `apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/unread-count.test.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/subscription-column/timeline-switch.test.ts`
- Create: `apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/interaction-regression.test.tsx`
- Create: `apps/desktop/layer/renderer/src/providers/renderer-boundaries.test.ts`

**Source AC:** `AC-6`, `AC-7`

**Design anchors:** `D-009`, `D-010`

**Test cases:** `TC-6`

**Support lenses:** `architecture-designer` for Desktop/Remote entry boundaries; `lancet` for limiting characterization to measured critical paths.

**Review focus:**

- The tests lock current unread/alphabetical sorting, direction, selection, context menu, keyboard navigation, focus restoration, drag/drop, category expansion, and subscription add/edit/delete propagation.
- The 800-subscription characterization uses deterministic data and asserts behavior, not a machine-specific duration threshold.
- Initial graph assertions distinguish `main` and `remote` inputs and do not equate fewer chunks with success.

**Expected execution evidence:**

- Focused Vitest evidence showing all pre-existing and new characterization tests pass before production edits.
- A production analyzer/build artifact recording main/Remote initial JS, shared JS, shared CSS, chunk requests, and whether command/Shiki/Desktop-only modules are reachable from each entry.
- Caller-proof `rg` output captured in the task evidence.

**TDD steps:**

- [ ] Add behavior characterization for selection, context menu, keyboard movement, focus restoration, drag target behavior, and category collapse/expand using current DOM behavior.
- [ ] Extend sorting/unread/timeline tests to include deterministic 400- and 800-subscription inputs without adding new product semantics.
- [ ] Add a renderer-boundary test that fails while `root-providers.tsx` and `parse-html.ts` retain forbidden static imports.
- [ ] Run:

  ```bash
  pnpm --filter @suhui/web exec vitest run \
    src/modules/subscription-column/SortedFeedItems.test.tsx \
    src/modules/subscription-column/subscription-list/unread-count.test.ts \
    src/modules/subscription-column/timeline-switch.test.ts \
    src/modules/subscription-column/subscription-list/interaction-regression.test.tsx \
    src/providers/renderer-boundaries.test.ts
  ```

  Expected: behavior tests pass; the new boundary assertions fail only on the known eager imports, establishing RED for T-002.

- [ ] Run the existing production analyzer path and save its generated report location and sizes:

  ```bash
  analyzer=1 pnpm --filter suhui build:electron-vite
  ```

  Expected: production renderer build succeeds and produces an inspectable graph for both `main` and `remote`; record the actual artifact path rather than assuming a filename.

### T-002 / Task 2: Move measured non-critical dependencies behind lazy boundaries and gate hot traces

**Files:**

- Modify: `apps/desktop/layer/renderer/src/providers/root-providers.tsx`
- Modify: `apps/desktop/layer/renderer/src/providers/lazy/index.ts`
- Modify: `apps/desktop/layer/renderer/src/providers/lazy/index.electron.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/command/command-manager.ts`
- Modify: `apps/desktop/layer/renderer/src/lib/parse-html.ts`
- Modify: `apps/desktop/layer/renderer/src/components/ui/code-highlighter/index.ts`
- Create: `apps/desktop/layer/renderer/src/components/ui/code-highlighter/lazy-code-highlighter.tsx`
- Create: `apps/desktop/layer/renderer/src/components/ui/code-highlighter/lazy-code-highlighter.test.tsx`
- Modify: `apps/desktop/layer/renderer/src/initialize/index.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/entry-column/index.tsx`
- Modify: `apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntryMarkReadHandler.tsx`
- Modify: `apps/desktop/layer/main/src/ipc/services/db.ts`
- Modify: `packages/internal/database/src/services/entry.ts`
- Modify: `apps/desktop/layer/renderer/src/providers/renderer-boundaries.test.ts`

**Source AC:** `AC-6`, `AC-7`

**Design anchors:** `D-010`, `D-013`

**Test cases:** `TC-6`

**Support lenses:** `architecture-designer` for entry-specific dependency ownership; `lancet` to avoid unmeasured repository-wide dependency cleanup.

**Review focus:**

- Root providers keep shell-critical services synchronous; settings, discover/editor/modal content, command implementations, and Shiki move only where baseline evidence shows initial reachability.
- Command IDs and basic shortcuts remain registered synchronously, and first invocation waits for/retries the implementation chunk rather than silently doing nothing.
- Remote initial graph cannot acquire Electron-only providers through a shared barrel.
- Plain code blocks render before Shiki, and failed enhancement never loses content.
- Detailed `[startup-read-trace]` output is flag-gated while stable startup metrics and refresh audit remain unconditional.

**Expected execution evidence:**

- `renderer-boundaries.test.ts` turns GREEN and lazy-highlighter tests prove fallback/success/failure behavior.
- Existing command/shortcut and entry mark-read focused tests pass.
- Before/after analyzer evidence names exact main/Remote initial/shared asset sizes and lazy chunks; it records user P95 separately and does not claim success from bundle size alone.
- Negative searches show no forbidden static imports and no unguarded detailed trace sites.

**TDD steps:**

- [ ] Add failing lazy-highlighter tests for immediate plain-code render, later enhancement, and import failure preserving text.
- [ ] Change root/lazy provider exports so non-critical implementations load on first feature use; keep lightweight registrations needed by initial shortcuts.
- [ ] Replace the static `parse-html` highlighter dependency with the explicit lazy component and plain-code fallback.
- [ ] Route every `[startup-read-trace]` hot-path write through `isStartupReadTraceEnabled()` using the existing preload/argv flag; leave `[startup]` metrics untouched.
- [ ] Run:

  ```bash
  pnpm --filter @suhui/web exec vitest run \
    src/components/ui/code-highlighter/lazy-code-highlighter.test.tsx \
    src/providers/renderer-boundaries.test.ts
  pnpm --filter @suhui/web typecheck
  pnpm --filter @suhui/electron-main typecheck
  ```

  Expected: renderer tests and web typecheck pass. Main typecheck passes or is recorded as `blocked` with fresh existing rootDir/file-list output; historical failure must not be represented as a pass.

- [ ] Rebuild the graph:

  ```bash
  analyzer=1 pnpm --filter suhui build:electron-vite
  ```

  Expected: production build succeeds; report proves the targeted implementations are outside the relevant initial entry graph and still exist as loadable chunks.

- [ ] Run the negative assertions from this plan. Expected: no forbidden eager imports, no unguarded trace site, no schema/migration/unrelated-file diff.

### T-003 / Task 3: Stabilize sidebar derivation and render subscriptions, virtualizing only behind the evidence gate

**Files:**

- Create: `apps/desktop/layer/renderer/src/modules/subscription-column/sidebar-derived-model.ts`
- Create: `apps/desktop/layer/renderer/src/modules/subscription-column/sidebar-derived-model.test.ts`
- Modify: `packages/internal/store/src/modules/subscription/hooks.ts`
- Modify: `apps/desktop/layer/renderer/src/modules/subscription-column/SortedFeedItems.tsx`
- Modify: `apps/desktop/layer/renderer/src/modules/subscription-column/FeedCategory.tsx`
- Modify: `apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/SubscriptionList.tsx`
- Modify: `apps/desktop/layer/renderer/src/modules/subscription-column/SortedFeedItems.test.tsx`
- Modify: `apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/interaction-regression.test.tsx`

**Source AC:** `AC-6`

**Design anchors:** `D-009`, `D-013`

**Test cases:** `TC-6`

**Support lenses:** `architecture-designer` for state/render boundaries; `lancet` for the selector-first and evidence-gated virtualization decision.

**Review focus:**

- Pure derivation consumes narrow selected inputs and preserves current category grouping, unread/alphabetical order, direction, tie behavior, collapsed state, and unread totals.
- Unrelated subscription/store writes do not rebuild every category or row; React profiling records commit duration and render count at 400 and 800 subscriptions.
- Virtualization is introduced only if profiling identifies mounted DOM/commit work as the dominant remaining cost. If introduced, row height/measurement and overscan are explicit; context menus and drag overlays do not rely on unmounted nodes; focus restoration and scroll-to-item work.
- If virtualization fails any drag/accessibility characterization, the delivered result remains the selector/memo path and the evidence states that decision.

**Expected execution evidence:**

- Pure-model tests cover 400/800 deterministic fixtures, sorting modes/directions, collapsed categories, unread changes, and referential stability.
- All existing and new sidebar interaction tests pass on the chosen render path.
- A profiling artifact records fixture size, commit duration, render counts, chosen optimization, and whether virtualization gate was entered; if not entered, evidence says DOM was not the dominant bottleneck.
- Plan 06 can consume the finalized sidebar metrics without reinterpreting behavior.

**TDD steps:**

- [ ] Add failing pure-model tests for exact current ordering, category visibility, unread aggregation, and referential stability under unrelated updates.
- [ ] Implement `deriveSidebarModel` and narrow store selectors; update category/feed components to subscribe only to needed identities/fields.
- [ ] Profile the memo/selector path at 400 and 800 subscriptions and save render count/commit-duration evidence.
- [ ] If and only if the saved profile proves DOM count dominates, add fixed/measured row strategy plus overscan inside `SubscriptionList.tsx`, then extend interaction tests for offscreen focus and cross-viewport drag. Otherwise record `virtualization: not_entered` with measured rationale and do not add a virtualization dependency.
- [ ] Run:

  ```bash
  pnpm --filter @suhui/web exec vitest run \
    src/modules/subscription-column/sidebar-derived-model.test.ts \
    src/modules/subscription-column/SortedFeedItems.test.tsx \
    src/modules/subscription-column/subscription-list/unread-count.test.ts \
    src/modules/subscription-column/timeline-switch.test.ts \
    src/modules/subscription-column/subscription-list/interaction-regression.test.tsx
  pnpm --filter @suhui/web typecheck
  ```

  Expected: all focused behavior tests and web typecheck pass for the selected memo-only or virtualized implementation.

- [ ] Run `pnpm --filter suhui build:electron-vite`. Expected: production renderer build succeeds for both main and Remote inputs.

## Plan-Level Verification

- [ ] Run every focused command from T-001 through T-003 with fresh output.
- [ ] Run:

  ```bash
  pnpm --filter @suhui/web exec vitest run \
    src/modules/subscription-column \
    src/components/ui/code-highlighter/lazy-code-highlighter.test.tsx \
    src/providers/renderer-boundaries.test.ts
  pnpm --filter @suhui/web typecheck
  pnpm --filter suhui build:electron-vite
  ```

  Expected: focused renderer suites, typecheck, and production renderer build pass.

- [ ] Record before/after main and Remote initial JS/shared JS/shared CSS/chunk requests plus 400/800 sidebar commit duration/render count. Do not mark this child complete solely because assets shrink.
- [ ] Manually verify first open of a lazy settings/command surface, a code block with enhancement success/failure, context menu, keyboard traversal, focus restoration, and drag behavior.
- [ ] Run caller-proof and negative-assertion searches. Expected: targeted eager edges are absent, retained features still have current callers, detailed traces are gated, and DB/schema/unrelated files are untouched.
- [ ] Record evidence in the shared YAML shape with command, cwd, timestamp, exit code, focused/full scope, result, output summary, skipped checks, and environment constraints.
- [ ] Run plan-level `final-review`; update package state for plan 05. Only after clean review, create one child-plan implementation commit. Do not stage or commit per task.

## Execution Handoff

Package execution remains:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md
```

Direct child execution for controlled resume only:

```text
$subagent-exec docs/loopx/plans/2026-07-13-suhui-performance-refactor/05-renderer-startup-and-sidebar.md
```

Stop and return to the controller if preserving shortcut, code-content, sidebar accessibility/drag behavior requires a new product decision, or if performance evidence points to a database index/schema change. Do not broaden the implementation.
