# Child 02 T-002 Review Feedback Ledger

| ID     | Severity  | Source      | Finding                                                                    | Basis                           | Decision       | Evidence                                                                                                                                                                | Verification                                   | Re-review | Status |
| ------ | --------- | ----------- | -------------------------------------------------------------------------- | ------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------- | ------ |
| FR-001 | Important | task review | shallow snapshot validation can accept/partially apply corrupt rows        | AC-3; D-006; TC-3; T-002        | accepted_fixed | Full row validators for feeds/subscriptions/unreads/entries run before hydrate transaction; malformed summary and later malformed metadata tests prove zero store calls | focused startup-snapshot Vitest PASS (8 tests) | pass      | closed |
| FR-002 | Important | task review | stale cleanup can delete summaries still referenced by current query pages | AC-3; D-005; D-006; TC-3; T-002 | accepted_fixed | restore boundary derives protected IDs from React Query `entries` pages and passes them explicitly; repeated restore regression added                                   | store projection Vitest PASS (6 tests)         | pass      | closed |
| FR-003 | Important | task review | implementer report lacks required anchor/evidence schema fields            | task handoff evidence contract  | accepted_fixed | Report contains the required top-level anchor/evidence/surface fields and accurate deferred TC-6/typecheck evidence                                                     | report schema and Prettier PASS                | pass      | closed |

## Feedback Lancet Decisions

- FR-001: validate the entire existing snapshot shape before any mutation; no partial rollback layer.
- FR-002: reuse current React Query page membership/normalized state ownership rather than add a second cache.
- FR-003: evidence-only report correction.

Originating task re-review: `SPEC_COMPLIANT`; task quality `Approved`; no remaining findings.
