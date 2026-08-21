# T-001 Review Feedback Ledger

| ID     | Severity  | Source         | Finding                                                                                | Basis                                                | Decision       | Evidence                                                                                                                                                       | Verification                                                                             | Re-review | Status |
| ------ | --------- | -------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------- | ------ |
| FR-001 | Important | task review    | `entry/service.ts` production list reads bypass `entryQueryService`                    | T-001 review focus; D-001                            | accepted_fixed | `entry/service.ts` delegates to `entryQueryService.list` and returns `page.items`; T-002 envelope unchanged                                                    | focused suite 63/63; production `findMany` search leaves only agent read-status mutation | pass      | closed |
| FR-002 | Important | task review    | agent limits are truncated/clamped instead of rejected                                 | T-001 limit contract; D-002                          | accepted_fixed | `agent/types.ts` accepts only finite integer numbers 1..100; tests cover 0/101/1.5/numeric string/NaN/infinity                                                 | focused suite 63/63                                                                      | pass      | closed |
| FR-003 | Important | task review    | timeline/collection optional fields lack runtime validation                            | D-001 scope normalization and explicit errors        | accepted_fixed | `query-service.ts` validates timeline/collection `view` and timeline `excludePrivate`, throwing `SUHUI_INVALID_ENTRY_SCOPE`                                    | focused suite covers invalid types, fractional and non-finite values                     | pass      | closed |
| FR-004 | Important | task review    | characterization lacks exact order/tie/concurrent insertion/read/scope invalid cases   | T-001 Step 1; D-002; TC-1/TC-2                       | accepted_fixed | `query-service.test.ts` adds exact three-column order, same-time id DESC, strict older-page cursor, invalid read and invalid scope-field cases                 | focused suite 63/63                                                                      | pass      | closed |
| FR-005 | Important | task review    | review package omitted untracked files and report lacks required anchor/surface fields | task-handoff-and-review evidence contract            | accepted_fixed | report now uses a per-anchor `anchor_coverage` status map and top-level `implemented_anchor_ids`/`tests_for_anchor_ids`, plus required surface/evidence fields | second-pass focused suite and Prettier pass                                              | pass      | closed |
| FR-006 | Minor     | task review    | unused `agentEntriesMaxScanRows` import                                                | changed-code quality                                 | accepted_fixed | import removed from `agent/service.ts`                                                                                                                         | focused suite and Prettier pass                                                          | pass      | closed |
| FR-007 | Minor     | task re-review | stale `agentEntriesMaxLimit` import and active-visibility test mocks remain            | changed-code quality after shared-service delegation | accepted_fixed | removed unused service import and obsolete test hoist symbol/module mock                                                                                       | second-pass focused suite and Prettier pass                                              | pass      | closed |

## Feedback Lancet Decisions

- FR-001 reused `entryQueryService.list` and preserved the compatibility array envelope; no T-002
  transport work, wrapper, fallback, or parallel filtering path was added.
- FR-002 and FR-006 are one co-located validation/import cleanup with no new abstraction.
- FR-003 extends the existing `normalizeScope` boundary rather than adding transport-specific checks.
- FR-004 adds characterization to the existing focused test file only.
- FR-005 updates existing evidence artifacts and explicitly accounts for untracked task files; it does
  not stage files or use the Git index.
- FR-007 deletes stale symbols only; no behavior or abstraction change.

## Fresh Verification

- Second-pass focused Vitest: PASS, 2 files / 63 tests.
- Second-pass Prettier check: PASS for code, report, and ledger files.
- Second-pass stale-symbol search: PASS, no matches for `agentEntriesMaxLimit`,
  `isEntryVisibleForActiveRelations`, or `getActiveVisibilityState` in the reviewed agent files.
- Prior focused Vitest: PASS, 2 files / 63 tests.
- Prettier check: PASS for eight T-001 files.
- Typecheck: baseline-blocked; fresh rerun has no diagnostic in a T-001 changed file.
- Schema/migration guard: PASS, no output.
- Re-review: `SPEC_COMPLIANT` and task quality `Approved`; FR-001 through FR-007 are closed.
