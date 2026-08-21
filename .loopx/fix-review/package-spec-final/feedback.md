# Package Spec Final Review Feedback

Source review: package/spec-level final review of `01f18d72b6a946b8d2ca2501741c12255ac6e174..08c90df32`

| ID     | Severity  | Source       | Finding                                                                                            | Basis                                                                                                                      | Decision       | Evidence                                                                                                                                                                                                            | Verification                                                                                                                      | Re-review                                                       | Status |
| ------ | --------- | ------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| FR-001 | Important | final-review | `desktop-feed-usable` measures the initial route list instead of a deterministic feed/view switch. | `AC-6`; `D-012`; `TC-6`; `run-desktop.ts:375-397`; `useEntriesByView.ts:85-99`                                             | accepted_fixed | Harness clears the initial feed/query phase, clicks a deterministic inactive All/Articles timeline button, confirms the new active identity, and records the existing session-scoped usable metric.                 | Runner 3/3; renderer metric/timeline 19/19; refreshed P95 normal cold/warm 69.9/65.8ms, stress cold/warm 131.6/95.6ms; gate pass. | Package/spec final-review recheck passed 30/30 with no findings | closed |
| FR-002 | Important | final-review | `TC-1`/`TC-2` do not fully exercise real PostgreSQL keyset pages and IPC/HTTP parity.              | `AC-1`; `AC-2`; `TC-1`; `TC-2`; mock boundaries in query-service, IPC, and HTTP tests; EXPLAIN-only production DB evidence | accepted_fixed | New explicit isolated-PostgreSQL integration drives production `EntryQueryService` through real `DbService` and `RemoteServerManager` adapters; also fixes the collection subquery alias exposed by real execution. | PostgreSQL transport 10/10; combined 4 files/114 tests; dedicated DB rows cleaned 0/0/0/0; schema/migration/config diff clean.    | Package/spec final-review recheck passed 30/30 with no findings | closed |

## Lancet Decisions

- FR-001: retain the existing harness and stable metric path; add the smallest deterministic UI switch hook/driver needed to measure a changed query identity. Do not add another timing subsystem.
- FR-002: reuse the existing fixture, shared query service, and transport adapters. Do not introduce a second database schema, migration, or duplicated query implementation.

## Closure Rule

Both findings require focused verification, refreshed production evidence where applicable, and a fresh package/spec-level final-review recheck before closure.

## Task Re-review Evidence

- FR-001: independent task review approved the real view-switch metric path; refreshed normal/stress cold/warm production samples and package re-review later closed the finding.
- FR-002: independent task review approved the real PostgreSQL/IPC/HTTP coverage; package re-review later closed the finding.

## Package Re-review Closure

- Reviewed at: `2026-07-15T22:26:00Z`
- Review head: `c3064c2550bc56b6ae1020e10b79ad2b1e5d0321`
- Result: 30/30 source anchors covered; no Critical, Important, or Minor findings; `Ready for finish? Yes`.
- FR-001 and FR-002 are closed.
