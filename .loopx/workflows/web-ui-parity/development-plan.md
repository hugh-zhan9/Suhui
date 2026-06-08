---
slug: web-ui-parity
artifact: development-plan
status: approved
recommended_lane: build
---

# Development Plan: Web UI Parity

## Scope

Rework the existing Desktop-hosted remote Web UI so it is visually and workflow-consistent with the desktop app. This plan does not create a separate Web app/server and does not change persistence, auth, or main-process ownership.

## Execution Inputs

- Requirements: `.loopx/specs/clarify-web-ui-parity-20260508211654.md`
- Context: `.loopx/context/web-ui-parity-20260508212834.md`
- Architecture: `.loopx/workflows/web-ui-parity/architecture.md`
- Test plan: `.loopx/workflows/web-ui-parity/test-plan.md`
- Primary implementation file: `apps/desktop/layer/renderer/src/remote/remote-app.tsx`
- Styling: `apps/desktop/layer/renderer/src/remote/remote.css`
- Runtime client: `packages/internal/store/src/runtime/client.ts`
- Remote bootstrap: `apps/desktop/layer/renderer/src/remote/main.tsx`

## Phase 0: Baseline And Guardrails

1. Capture current dirty worktree state and do not revert unrelated changes.
2. Read the current desktop modules as visual references:
   - `modules/app-layout`
   - `modules/subscription-column`
   - `modules/entry-column`
   - `modules/entry-content`
   - `modules/settings`
3. Confirm current remote features and runtime methods still cover:
   - read/unread
   - refresh
   - subscription CRUD/batch
   - settings/RSSHub
   - import/export
   - PDF export
4. Avoid changing `apps/desktop/layer/main/src/remote` and `apps/desktop/layer/main/src/application` unless UI work exposes a narrow missing operation.

Acceptance:

- Build notes identify any runtime gap before changing backend code.
- No architecture or auth changes are introduced.

## Phase 1: Split Remote UI Into Components

Create focused remote components under `apps/desktop/layer/renderer/src/remote/components/`.

Suggested split:

- `RemoteReaderShell`
- `RemoteSubscriptionRail`
- `RemoteEntryList`
- `RemoteReadingPane`
- `RemoteReaderToolbar`
- `RemoteManagementDrawer`
- `RemoteSettingsModal`
- shared status/empty/loading components

Refactor `remote-app.tsx` into orchestration:

- selected view/feed/entry
- unread-only state
- connection state
- drawer/modal state
- runtime action handlers

Acceptance:

- Existing behavior still compiles.
- Component boundaries avoid importing full desktop router/layout modules.

## Phase 2: Desktop-Like Three-Pane Reader

Implement the wide-browser first screen:

- left subscription/category rail with desktop-like view tabs and grouped feed list
- middle entry list with desktop-like density, read/unread distinction, selected state, loading and empty states
- right reading pane with title, source/meta, compact toolbar, content, and no temporary-form appearance

Required reader actions:

- unread-only toggle
- refresh current feed / refresh all
- open management drawer
- open settings modal
- open original link
- mark read/unread
- PDF export

Acceptance:

- At desktop width, the first screen shows all three panes.
- No top-level raw form panel appears in the reading flow.
- Empty/loading/offline states are styled as product UI, not debug text.

## Phase 3: Subscription And Batch Management Drawer

Move current subscription management out of full-screen raw panel into a drawer/modal matching desktop density.

Include:

- add subscription with URL/title/category/view
- preview action
- edit title/category/view
- delete subscription
- multi-select rows
- batch category/view update
- batch delete
- refresh selected feed or all feeds

Acceptance:

- Drawer can open and close without losing current reader context.
- Batch operations call existing `runtimeClient.subscriptions.*` and refresh remote stores.
- Controls have busy and disabled states.

## Phase 4: Settings / RSSHub / Import Export Surface

Move settings into a desktop-style modal/drawer with left navigation or sectioned layout.

Include Web-safe sections:

- appearance if current runtime supports it
- RSSHub custom URL
- RSSHub precheck
- export data
- import data

Exclude:

- native folder picker
- system proxy
- notifications
- startup/tray/dock
- desktop integrations
- command palette/shortcuts
- AI/translation/summary surfaces

Acceptance:

- Import/export no longer appears as a rough main-screen textarea panel.
- Export can use browser download or copyable payload area, but it must look intentional.
- Import validates JSON enough to show a user-facing error rather than silently failing.

## Phase 5: PDF Export Polish

Keep the existing remote PDF route and runtime call.

UI requirements:

- PDF action appears in the reading pane toolbar.
- Busy state prevents duplicate exports.
- Error state is visible if the route returns an error.
- Browser download is acceptable.

Acceptance:

- `runtimeClient.pdf.exportEntry(entryId)` remains the single remote UI path.
- No native save dialog is attempted in browser remote.

## Phase 6: Tests And Verification

Run focused tests and add coverage where implementation creates testable helpers or component state.

Required commands:

```text
pnpm --filter @suhui/web exec vitest --run src/remote/entry-navigation.test.ts
pnpm --filter @suhui/web typecheck
pnpm --filter suhui build:render
```

Conditional commands if runtime routes change:

```text
pnpm --filter @suhui/electron-main test -- --run apps/desktop/layer/main/src/application apps/desktop/layer/main/src/remote
pnpm exec vitest --config apps/desktop/layer/renderer/vitest.config.ts --run packages/internal/store/src/runtime/client.test.ts
```

Known blocker note:

- `pnpm --filter @suhui/electron-main build` has existing unrelated project setup failures around `rootDir` / `include` and test type issues. Do not make that a UI parity pass/fail gate unless separately fixed.

## Phase 7: Screenshot Acceptance

Start the app or a suitable renderer preview and capture at least one wide-browser screenshot of the remote endpoint.

Screenshot gate:

- three panes visible
- no raw full-screen management form in the main view
- selected feed and selected entry are visually clear
- reading pane is not blank when an entry is selected
- no obvious overlap, overflow, clipped button text, or debug/temporary layout
- connection/offline state, if visible, is styled as product UI

Use Browser Use or Playwright depending on availability. Save or reference screenshot evidence in the execution record.

## Build Handoff

Recommended next command:

```text
$build --direct .loopx/workflows/web-ui-parity/development-plan.md
```
