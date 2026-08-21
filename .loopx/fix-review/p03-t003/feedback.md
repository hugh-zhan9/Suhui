# Child 03 T-003 Review Feedback Ledger

| ID     | Severity  | Source      | Finding                                                                                  | Basis                    | Decision       | Evidence                                                                                                                                                                                                                               | Verification                                                                                                                                                               | Re-review | Status |
| ------ | --------- | ----------- | ---------------------------------------------------------------------------------------- | ------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| FR-001 | Important | task review | event-first duplicate returns before in-flight invalidation settles and can hide failure | AC-4; D-007; TC-4; T-003 | accepted_fixed | coordinator stores one promise per active batch; duplicate origins await it; rejection reaches both callers and removes transient state; a later retry succeeds once; completed batches retain the five-minute TTL and 512-entry cache | store focused Vitest PASS (21/21); renderer focused Vitest PASS (18/18); store typecheck PASS; renderer typecheck baseline-only blocked; format/privacy/schema guards PASS | pass      | closed |

## Feedback Lancet Decision

- Reuse one per-batch in-flight promise in the existing coordinator; duplicate callers join it, failed work removes retry state, and no second coordinator/fallback path is added.

## Fresh Verification

- T-002 coordinator suite: PASS, 1 file / 21 tests.
- T-003 renderer suite: PASS, 2 files / 18 tests.
- Concurrent event-first success keeps the manual response pending and performs one successful active
  query refetch.
- Concurrent event-first rejection reaches both origins, runs the manual fallback once, and permits one
  later successful coordinator retry without a second successful coordinator refetch.
- `@suhui/store` typecheck: PASS.
- `@suhui/web` typecheck: blocked only by the unchanged `useEntryContextMenu.ts:41` diagnostics; no
  fix-review file appears in the output.
- Prettier, `git diff --check`, renderer metric privacy, and migration/schema guards: PASS.
- Originating task re-review: `SPEC_COMPLIANT`; task quality `Approved`; canonical review artifact verified.
