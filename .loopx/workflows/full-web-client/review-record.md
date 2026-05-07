---
slug: full-web-client
build_run_id: 20260507225856
reviewed_execution_record: .loopx/workflows/full-web-client/execution-record.md
verdict: no-go
review_status: complete
---

# Review Record: Full Web Client

## Verdict

no-go

## Rationale

The build record is complete enough to review, and the implementation follows the approved architecture direction: the remote Web surface stays Desktop-hosted, IPC and HTTP now share Electron-main application services, and first-version renderer paths are moving through `@suhui/store/runtime`.

However, code review found a blocking user-visible defect in a required feature. Web PDF export is listed as mandatory, but the HTTP PDF route calls the PDF service with only `entryId`, while the service requires `contentHtml`. In real use the route will throw instead of returning a PDF.

## Findings

### Medium: Web PDF export cannot succeed

- `apps/desktop/layer/main/src/remote/manager.ts:238` calls `deps.renderEntryPdf({ entryId })`.
- `apps/desktop/layer/main/src/application/pdf/service.ts:65` to `:68` throws when `contentHtml` is missing.
- `apps/desktop/layer/renderer/src/remote/remote-app.tsx:679` calls `runtimeClient.pdf.exportEntry(entryId)`, so the Web client never supplies article content.
- `apps/desktop/layer/main/src/remote/manager.test.ts:681` to `:685` mocks `renderEntryPdf` and asserts the broken `{ entryId }` contract, so tests pass while the real service path fails.

Impact: the required Web PDF export workflow is non-functional. Because PDF export was explicitly mandatory, this blocks acceptance.

## Evidence Review

Accepted evidence:

- Main targeted tests were recorded as passing: 47 files, 164 tests.
- Runtime client tests were recorded as passing: 3 tests.
- Remote entry navigation tests were recorded as passing: 8 tests.
- Renderer typecheck was recorded as passing.
- Renderer production build was recorded as passing.

Residual evidence limitation:

- `pnpm --filter @suhui/electron-main build` remains blocked by existing project setup issues. This does not by itself block review of this slice, but it remains a release risk.

## Rollback Guidance

Do not roll back the whole build slice. The architecture and most route/client work are directionally correct.

Required fix before re-review:

- Make `/api/entries/:id/pdf` fetch the entry detail server-side and pass `title`, `contentHtml`, metadata, and URL into `pdfApplicationService.renderEntryPdf`, or change the HTTP API to accept the same print payload the desktop IPC path already sends.
- Add a test that uses the real `pdfApplicationService` contract or asserts that `renderEntryPdf` receives `contentHtml`, not only `entryId`.
- Re-run the focused remote route test, runtime client test, renderer typecheck, and renderer build evidence after the fix.
