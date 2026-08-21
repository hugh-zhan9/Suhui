# Suhui Performance Refactor Requirements

## Intent

Reduce desktop and remote page-loading latency and eliminate data-volume-dependent UI stalls through
a behavior-preserving refactor of application queries, IPC/HTTP data transfer, startup hydration,
refresh invalidation, and renderer dependency loading.

## Source Facts

- Current production renderer shell readiness measured about 2051 ms in the diagnostic run.
- Startup snapshot restoration measured 81 ms and was not the primary delay.
- Entry list pagination currently receives unbounded full rows before applying cursor and limit.
- Critical hydration currently loads all visible entry rows, including content fields.
- Batch refresh currently emits cumulative success sets and causes repeated entry refetches.
- Remote React mounting currently waits for subscriptions, unread counts, and collections hydration.

## In Scope

- Application-level entry summary/detail query separation without persistent schema changes.
- Server-side filtering, deterministic ordering, cursor handling, projection, and limiting using the
  existing PostgreSQL schema.
- A shared application query service for Desktop IPC and remote HTTP callers.
- Bounded startup entry hydration and preservation of current visible content behavior.
- Coalesced or delta-based refresh notifications without changing refresh results.
- Renderer startup dependency splitting and lazy loading of non-critical capabilities.
- Subscription-sidebar selector/render optimization at the confirmed 400/800 subscription scales,
  while preserving sorting, selection, context menus, keyboard navigation, and drag behavior.
- Immediate remote shell rendering with equivalent loading, error, and final data behavior.
- Packaging exclusion and regression coverage for the removed embedded RSSHub runtime directory.
- Removal or lazy isolation of dependencies only when they directly affect the measured startup graph
  or packaged artifact.
- Characterization tests, performance harnesses, and regression budgets.

## Non-Goals

- No database engine replacement.
- No persistent schema or data migration redesign.
- No database configuration precedence redesign.
- No Electron, React, Drizzle, router, or state-library replacement.
- No remote authentication or permission redesign.
- No RSS product feature changes.
- No broad repository-wide unused-dependency cleanup without measured startup or artifact impact.

## Constraints

- Existing Desktop reading, unread, refresh, subscription, and detail behavior must remain compatible.
- Existing remote HTTP routes must remain compatible for current callers.
- Each execution commit must be independently verifiable and reversible.
- Existing unrelated worktree changes in `.gitignore` and `.vscode/settings.json` must be preserved.

## Decisions

- DEC-1: Keep the current PostgreSQL storage design.
- DEC-2: Prefer targeted application/data-flow refactoring over a technology-stack rewrite.
- DEC-3: Use 400 subscriptions / 10,000 entries as the normal performance fixture.
- DEC-4: Use 800 subscriptions / 100,000 entries as the stress performance fixture.
- DEC-5: Use P95 performance targets measured from production builds with fixed fixtures and repeated
  samples.
- DEC-6: Treat Desktop and hosted remote-browser performance as one initiative and one overall plan,
  with shared verification and staged checkpoints.
- DEC-7: Include startup-graph cleanup and RSSHub packaging exclusion, but exclude a general dependency
  cleanup campaign.

## Acceptance Criteria

- AC-1: WHEN an entry list requests a page THEN the main process returns a bounded, deterministically
  ordered summary page AND does not transfer full article bodies for list-only rendering.
- AC-2: WHEN Desktop IPC and remote HTTP request equivalent entry-list inputs THEN both use the same
  application query semantics while preserving their existing external response compatibility.
- AC-3: WHEN startup hydration runs THEN it does not load every persisted full article body into the
  renderer store AND the current initial timeline remains usable.
- AC-4: WHEN a batch refresh completes for N feeds THEN renderer synchronization performs O(N) or fewer
  feed entry reloads AND does not repeatedly reload cumulative prior results.
- AC-5: WHEN the remote page opens THEN a shell or explicit loading state renders before initial API
  hydration completes AND the final loaded content remains equivalent.
- AC-6: WHEN Desktop performance verification runs against either confirmed fixture THEN
  `shell_ready_ms` P95 is at most 1.2 seconds, time from `db_usable` to `interactive` P95 is at most
  500 milliseconds, AND feed or unread-view switching produces a usable list within 300 milliseconds
  at P95.
- AC-7: WHEN remote performance verification runs against either confirmed fixture THEN shell first
  visibility P95 is at most 800 milliseconds AND initial data readiness P95 is at most 1.5 seconds.
- AC-8: WHEN performance verification runs THEN it covers both the normal fixture of 400
  subscriptions / 10,000 entries and the stress fixture of 800 subscriptions / 100,000 entries.
- AC-9: WHEN a Desktop artifact is packaged THEN the removed embedded RSSHub runtime directory is not
  copied into the artifact AND a regression test protects the exclusion rule.

## Acceptance Scenarios

- TC-1 (AC-1, AC-2): Request the first and second pages for one feed and verify bounded rows, stable
  ordering, no duplicates, no omissions, and no list payload content fields.
- TC-2 (AC-1, AC-2): Request All, unread-only, and multiple-feed views through Desktop and remote paths
  and compare ordering and filtering semantics.
- TC-3 (AC-3): Start with a production-scale fixture and verify the initial route renders while the
  renderer store contains only the approved startup window.
- TC-4 (AC-4): Refresh 1, 10, and 50 feeds and assert entry reload count remains linear or lower.
- TC-5 (AC-5): Delay or fail one remote bootstrap dependency and verify a visible loading/error state
  appears before the request settles.
- TC-6 (AC-6, AC-7, AC-8): Run cold and warm performance regression suites against the normal and
  stress fixtures and compare all confirmed thresholds.
- TC-7 (AC-9): Build or stage a Desktop artifact and assert that no packaged path exists under
  `resources/rsshub` while required application resources remain present.

## Open Questions

None.

## Handoff Recommendation

Status: `needs_spec`.

The confirmed remote early-render behavior and cross-surface performance contract require a design
spec before implementation planning. After the last scope decision, hand off this intake package to
`spec`, then create one staged execution plan from the approved design.

Handoff:

```text
$spec .loopx/intake/2026-07-13-desktop-performance-refactor/
```
