---
slug: web-ui-parity
artifact: execution-record
status: review-ready
generated_at: 2026-05-08 22:44:11 CST
---

# Execution Record: Web UI Parity

## Scope

Implemented the approved `web-ui-parity` build plan for the existing Electron-main-hosted remote Web endpoint. This build keeps the browser client inside the current desktop remote architecture:

- no new top-level Web/server app
- no browser-side DB writes
- no auth model changes
- no main-process remote/application service changes required

## Source Inputs

- Requirements: `.loopx/specs/clarify-web-ui-parity-20260508211654.md`
- Development plan: `.loopx/workflows/web-ui-parity/development-plan.md`
- Architecture: `.loopx/workflows/web-ui-parity/architecture.md`
- Test plan: `.loopx/workflows/web-ui-parity/test-plan.md`

## Changes

- Reworked `apps/desktop/layer/renderer/src/remote/remote-app.tsx` into a desktop-like remote reader shell.
- Added the wide-browser three-pane reading layout:
  - left subscription/category rail
  - middle entry list
  - right reading pane
- Moved subscription CRUD, preview, batch update/delete, and refresh controls into a management drawer.
- Moved Web-safe settings, RSSHub configuration/precheck, and import/export into a settings modal.
- Kept PDF export in the reading pane toolbar through `runtimeClient.pdf.exportEntry(entryId)` with browser download behavior.
- Added `apps/desktop/layer/renderer/src/remote/remote-view-model.ts` for testable view/feed/import/export helpers.
- Added `apps/desktop/layer/renderer/src/remote/remote-view-model.test.ts` for grouping, available views, import JSON validation, PDF filename sanitization, and preferred entry selection.
- Updated `apps/desktop/layer/renderer/src/remote/remote.css` with remote-specific desktop-density controls, fields, buttons, counts, and prose styling.
- Added mock remote support server at `.loopx/workflows/web-ui-parity/support/mock-remote-server.mjs` for renderer screenshot verification against built `remote.html`.

## Acceptance Coverage

- Reading: entry list, selected entry, detail rendering, original-link action, read/unread action, unread-only toggle.
- Subscriptions: add, preview, edit title/category/view, delete.
- Batch subscription management: multi-select, batch category/view update, batch delete, refresh selected/all.
- Refresh: feed refresh from reader toolbar and drawer refresh action.
- Unread/read: toolbar action still calls runtime read-state path and refreshes unread state.
- Settings page: Web-safe settings modal with appearance, RSSHub URL, RSSHub precheck.
- Import/export: settings modal provides export download/text and import JSON validation/submission.
- RSSHub configuration: settings modal uses current runtime RSSHub precheck/update flow.
- PDF export: reading pane action uses `runtimeClient.pdf.exportEntry(entryId)` and browser blob download.

## Verification Evidence

Commands run after the final deslop pass:

```text
pnpm --filter @suhui/web exec vitest --run src/remote/remote-view-model.test.ts src/remote/entry-navigation.test.ts
```

Result: passed. 2 test files, 13 tests.

```text
pnpm --filter @suhui/web typecheck
```

Result: passed. `tsc --noEmit` exited 0.

```text
pnpm --filter suhui build:render
```

Result: passed. Vite build exited 0 and wrote renderer manifest.

Known build warnings observed and not introduced by this UI task:

- Vite CSS/PostCSS lexical warning around existing imported stylesheet text.
- Rollup dynamic-import/static-import chunk placement warnings.
- Existing large chunk size warnings.

## Screenshot Evidence

Mock remote server:

```text
node .loopx/workflows/web-ui-parity/support/mock-remote-server.mjs
```

Playwright verification was run against `http://127.0.0.1:41871/` after the final `build:render`.

Wide screenshot gate:

- evidence: `.loopx/workflows/web-ui-parity/support/remote-wide.png`
- viewport: `1440x900`
- measured panes:
  - rail: `276x900`
  - entry list: `388x900`
  - reading pane: `776x900`
- selected entry and article content rendered.
- management and settings entry points present.
- no raw full-screen management form appears in the main reader canvas.
- no Playwright page errors or console errors were reported.

Additional overlay evidence:

- management drawer: `.loopx/workflows/web-ui-parity/support/remote-management.png`
- settings modal: `.loopx/workflows/web-ui-parity/support/remote-settings.png`

## Deslop And Regression

- Ran targeted Prettier on the remote source files and mock server support script.
- Re-ran focused tests, typecheck, renderer build, and screenshot verification after formatting.

## Blockers

None.

## Review Handoff

The build lane is ready for independent review using this execution record.
