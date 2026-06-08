---
slug: web-ui-parity
artifact: test-spec
status: approved
---

# Test Spec: Web UI Parity

## Acceptance Tests

### Desktop Reader Layout

Given the remote Web endpoint is opened on a wide browser viewport, then the first screen shows a left subscription rail, middle entry list, and right reading pane.

Pass conditions:

- all panes are visible
- pane content does not overlap
- selected feed and selected entry are clear
- management forms are not displayed as the main screen

### Reader Workflow

Given subscriptions and entries exist, when a feed and entry are selected, then the reading pane displays title, source/meta, actions, and content.

Pass conditions:

- detail fetch is triggered for selected entry
- read/unread action works
- PDF export action is available
- open-original action is available when URL exists

### Management Drawer

Given the user opens subscription management, then a desktop-style drawer/modal appears without replacing the reader route as a raw full-screen form.

Pass conditions:

- create, preview, edit, delete, batch update, batch delete, and refresh actions are reachable
- busy states prevent duplicate actions
- closing returns to the same reader context

### Settings Surface

Given the user opens settings, then Web-safe settings, RSSHub config, and import/export are available in a polished modal/drawer.

Pass conditions:

- unsupported native desktop settings are absent
- RSSHub precheck is reachable
- import/export actions are reachable
- malformed import input shows an error

### Screenshot Gate

Given implementation is complete, when a 1440x900 or larger browser screenshot is captured, then the screenshot must show a production-quality desktop-like reader.

Reject conditions:

- full-screen raw forms
- generic admin dashboard layout
- blank primary canvas where content should exist
- obvious text/control overlap
- temporary debug styling as primary UI

## Required Commands

```text
pnpm --filter @suhui/web exec vitest --run src/remote/entry-navigation.test.ts
pnpm --filter @suhui/web typecheck
pnpm --filter suhui build:render
```

## Conditional Commands

```text
pnpm --filter @suhui/web exec vitest --run src/remote
pnpm exec vitest --config apps/desktop/layer/renderer/vitest.config.ts --run packages/internal/store/src/runtime/client.test.ts
pnpm --filter @suhui/electron-main test -- --run apps/desktop/layer/main/src/application apps/desktop/layer/main/src/remote
```

## Evidence Requirements

- Test command outputs summarized in execution record.
- At least one wide-browser screenshot referenced in execution record.
- Any skipped command must include a concrete reason.
