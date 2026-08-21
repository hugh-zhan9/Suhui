# Child 03 T-004 Review Feedback Ledger

| ID     | Severity  | Source                | Finding                                                                             | Basis              | Decision       | Evidence                                                                                                                                                                                 | Verification                                                           | Re-review | Status |
| ------ | --------- | --------------------- | ----------------------------------------------------------------------------------- | ------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------- | ------ |
| FR-001 | Important | canonical task review | failed partial reconciliation can make same batch retry and repeat effects          | AC-4; D-007; T-004 | accepted_fixed | coordinator claims batch before work; concurrent duplicate joins same promise; failed batch remains deduped in existing TTL/capacity window; regression in `change-invalidation.test.ts` | focused 41/41; full store 71/71; store typecheck pass                  | pass      | closed |
| FR-002 | Important | canonical task review | distinct out-of-order batches can apply stale metadata completion after newer state | D-007; TC-4; T-004 | accepted_fixed | existing coordinator owns one failure-isolated calibration queue for batch and reconnect work; reversed-completion regression covers subscriptions/unread/collections                    | focused 41/41; full store 71/71; store typecheck pass                  | pass      | closed |
| FR-003 | Important | canonical task review | post-commit reconciliation failure rejects successful Remote mutation               | AC-6; D-007; T-004 | accepted_fixed | runtime returns successful HTTP envelope without awaiting calibration; fixed batchId-only error log; HTTP 503 still rejects; reconnect/bootstrap remains recovery path                   | focused 41/41; remote UI 17/17; full store 71/71; store typecheck pass | pass      | closed |

## Feedback Lancet Decisions

- FR-001: keep same-batch at-most-once ownership even on failure; surface calibration failure without replaying partial effects.
- FR-002: serialize or generation-fence metadata calibration in the existing coordinator; no second state store.
- FR-003: separate server mutation success from best-effort cache calibration while keeping reconciliation errors visible and retryable.

## Verification Evidence

```yaml
timestamp: 2026-07-15T01:40:09Z
cwd: /Users/zhangyukun/project/Suhui
focused_store:
  command: pnpm --filter @suhui/store exec vitest run src/remote/sse-handler.test.ts src/modules/unread/invalidate-entries.test.ts src/modules/entry/change-invalidation.test.ts
  result: PASS (3 files, 41 tests)
full_store:
  command: pnpm --filter @suhui/store exec vitest run
  result: PASS (13 files, 71 tests)
store_typecheck:
  command: pnpm --filter @suhui/store typecheck
  result: PASS
remote_ui:
  command: pnpm --filter @suhui/web exec vitest run src/remote/entry-navigation.test.ts src/remote/remote-view-model.test.ts
  result: PASS (2 files, 17 tests)
renderer_typecheck:
  command: pnpm --filter @suhui/web typecheck
  result: BLOCKED_BY_PRE_EXISTING_REPOSITORY_DIAGNOSTICS
  evidence: only unchanged useEntryContextMenu.ts:41 TS18049/TS2339 diagnostics remain
re_review: SPEC_COMPLIANT / Approved; canonical artifact verified
```
