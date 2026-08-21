# Child 05 T-002 Review Feedback Ledger

| ID     | Severity  | Source                      | Finding                                                                                                                         | Basis                    | Decision       | Evidence                                                                                                                                                                                                           | Verification                                                                                                                                                    | Re-review                    | Status |
| ------ | --------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------ |
| FR-001 | Important | canonical task review F-001 | deferred placeholders are removed before real command hooks commit, allowing concurrent shortcuts/clicks to be silently dropped | AC-7; D-010; TC-6; T-002 | accepted_fixed | `command-manager.ts` keeps proxies mounted through readiness; `registry.ts` atomically replaces deferred commands and uses identity-safe cleanup; mounted lifecycle tests cover load/render/registration and retry | renderer 11 files/47 tests; main trace 2/2; database trace 2/2; production build PASS; negative guards PASS; typechecks show only recorded baseline diagnostics | canonical attempt 2 approved | closed |

## Lancet Decision

- Preserve one stable proxy per synchronous command ID through the load/registration handoff, or atomically replace the registry target after readiness. Add a mounted `FollowCommandManager` lifecycle regression that invokes commands during chunk resolution and real-hook registration, proving every invocation executes exactly once. Do not add a second command registry or broader command rewrite.

Implemented the smaller atomic-replacement option inside the existing registry. Deferred identity is metadata on registered command objects, not a second command registry. Existing real hooks retain ownership and replace only deferred placeholders; ordinary duplicate registrations still warn and remain unchanged.

## Verification Evidence

- `pnpm --filter @suhui/web exec vitest run ...`: 11 files, 47 tests passed, including mounted handoff/retry, no duplicate-registration warning, unmount cleanup, command shortcuts, highlighter, renderer boundaries, mark-read, parse HTML, traces, and 400/800 subscription characterization.
- `pnpm --filter @suhui/electron-main exec vitest run src/startup-read-trace.test.ts`: 2/2 passed.
- `pnpm --filter @suhui/database exec vitest run src/startup-read-trace.test.ts`: 2/2 passed.
- Fresh typechecks produced only the report's existing baseline diagnostics: web `useEntryContextMenu.ts:41`; main rootDir/file-list and existing tests/plugin/database diagnostics; database `db.main.ts:28 processID`. No changed command file diagnostic.
- `analyzer=1 pnpm --filter suhui build:electron-vite`: production main/preload/renderer build passed; main/Remote HTML still omit command and Shiki lazy chunks from initial requests.
- Negative guards: no root static `FollowCommandManager` import, no static code-highlighter import from parse HTML, no unguarded detailed trace match, and no migration/schema diff. `.gitignore` and `.vscode/settings.json` remain pre-existing user changes.
- Re-review remains required before FR-001 can be closed.
- Canonical attempt 2 returned `SPEC_COMPLIANT / Approved`; artifact: `.loopx/subagent-exec/reviews/05-T-002/review-artifact.json`.
