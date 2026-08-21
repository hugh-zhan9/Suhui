# Child 05 T-001 Review Feedback Ledger

| ID     | Severity  | Source                                   | Finding                                                                                                                      | Basis                         | Decision       | Evidence                                                                                                                                                                                             | Verification                                                                                                                                                                              | Re-review                    | Status |
| ------ | --------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------ |
| FR-001 | Important | canonical task review F-001              | interaction characterization replaces the production category/feed path and cannot detect key behavior regressions           | D-009; TC-6; T-001            | accepted_fixed | `interaction-regression.test.tsx` now renders real `SubscriptionList -> SortableFeedList -> FeedCategory -> SortedFeedItems -> FeedItem` owners and real `SubscriptionColumnContainer` drop dispatch | focused 5-file gate: 18 pass and exactly 2 intended boundary RED; renderer typecheck BASELINE_BLOCKED only at unchanged `useEntryContextMenu.ts:41`; Prettier and `git diff --check` PASS | canonical attempt 3 approved | closed |
| FR-002 | Important | canonical task re-review attempt 2 F-001 | report and FR-001 evidence falsely record renderer typecheck as PASS instead of the reproducible historical baseline failure | TC-6; T-001 evidence contract | accepted_fixed | report and FR-001 evidence now record exit 2 with TS18049/TS2339 at unchanged `src/hooks/biz/useEntryContextMenu.ts:41`; no task-file diagnostic                                                     | fresh `pnpm --filter @suhui/web typecheck`: exit 2, same two historical diagnostics only                                                                                                  | canonical attempt 3 approved | closed |

## Lancet Decision

- Retain useful `SubscriptionList` wiring tests, but exercise the real category/feed rendering boundary for context-menu active/reset, collapse/expand, grouped add/edit/delete propagation, droppable/drop dispatch, and first/last keyboard wrap. Mock external stores/services, not the components that own these contracts. Do not change production code in this characterization task.

## FR-001 Verification

- Executable real-owner coverage: FeedItem context-menu active/reset; command-driven FeedCategory collapse selection reset and re-expand; grouped add/edit/delete propagation; FeedCategory droppable payload; SubscriptionColumnContainer category drop mutation/reset; actual last-to-first and first-to-last keyboard wrapping.
- External boundaries mocked: stores/hooks, menu presentation promise, motion/portal UI, browser-facing services, and DnD hook plumbing.
- Focused behavior files: 17/17 passing.
- Boundary-inclusive gate: 18 passing and exactly the two T-002 eager-import assertions failing as expected.
- Renderer typecheck: BASELINE_BLOCKED only at unchanged `src/hooks/biz/useEntryContextMenu.ts:41` with TS18049/TS2339; no task-file diagnostic. Prettier and diff check pass.
- Re-review remains required before closure.

## FR-002 Verification

- Fresh command: `pnpm --filter @suhui/web typecheck`.
- Canonical attempt 3 returned `SPEC_COMPLIANT / Approved` with no findings; artifact: `.loopx/subagent-exec/reviews/05-T-001/review-artifact.json`.
- Result: exit 2 with TS18049 (`item` possibly null/undefined) and TS2339 (`id` absent on `false | "" | MenuItemText`) at unchanged `src/hooks/biz/useEntryContextMenu.ts:41`.
- No production or test file was edited for this evidence correction.
- Re-review remains required before closure.
