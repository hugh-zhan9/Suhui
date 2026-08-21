# T-003 Review Feedback Ledger

```yaml
status: closed
task_anchor: T-003
source_ac: [AC-3]
design_anchors: [D-003, D-005]
finding_ids: [FR-001, FR-002]
implemented_anchor_ids: [AC-3, D-003, D-005, T-003]
tests_for_anchor_ids:
  AC-3:
    [
      snapshot summary serialization/normalization,
      restored summary detail transport,
      dirty read reconciliation,
    ]
  D-003: [shared video URL derivation, false-positive attachment and description cases]
  D-005: [summary projection survives startup restore until explicit detail merge]
  T-003: [focused store, renderer, startup snapshot, and main compatibility suites]
```

| ID     | Severity  | Source      | Finding                                                                        | Basis                     | Decision       | Evidence                                                                                                                                                                                                                                                                                              | Verification                                                                                                       | Re-review | Status |
| ------ | --------- | ----------- | ------------------------------------------------------------------------------ | ------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- | ------ |
| FR-001 | Important | task review | restored summary snapshots are marked detail-loaded and suppress body fetch    | AC-3; D-003; D-005; T-003 | accepted_fixed | snapshot serialization writes `recordKind: summary`; restore normalizes stored `summary` to `description` and forces summary projection before the store call; the store excludes it from `detailLoadedEntryIds`, then ordinary detail transport upgrades it while preserving a dirty optimistic read | startup snapshot 5/5 with exact restore argument; store projection 4/4; store typecheck PASS                       | pass      | closed |
| FR-002 | Important | task review | video summary sufficiency predicate differs from actual preview URL derivation | D-003; T-003              | accepted_fixed | sufficiency now calls shared `transformVideoUrl` with the same mini URL/attachments inputs used by `VideoItem`, plus the same first-media fallback; image attachments and description-only URLs request detail                                                                                        | visible-detail-prefetch 5/5; full renderer focused suite 26/26; Prettier and changed-code type surface checks PASS | pass      | closed |

## Feedback Lancet Decisions

- FR-001 will preserve snapshot projection truth and reuse the ordinary explicit detail fetch path; no fallback body hydration is added.
- FR-002 will share/reuse the renderer's existing video URL derivation semantics rather than introduce a second heuristic.

## Fresh Verification

- Store focused Vitest: PASS, 3 files / 11 tests.
- Renderer focused plus startup snapshot Vitest: PASS, 5 files / 26 tests.
- Main compatibility Vitest: PASS, 4 files / 113 tests.
- Store typecheck: PASS.
- Renderer and main typechecks: baseline-blocked; fresh output reports no T-003 changed file.
- Deprecated caller, timestamp cursor, fake pagination, and `useLocalEntries` guards: PASS.
- `git diff --check`: PASS; schema/migration guard has no output. User-owned `.gitignore` and `.vscode/settings.json` changes remain preserved.
- Second FR-001 pass: startup snapshot 5/5 and store projection 4/4 PASS; exact restore argument is summary-only and maps persisted `summary` to store `description`.
- Originating task re-review: `SPEC_COMPLIANT`; task quality `Approved`; no remaining findings.
