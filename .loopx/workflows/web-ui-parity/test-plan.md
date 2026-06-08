---
slug: web-ui-parity
artifact: test-plan
status: approved
---

# Test Plan: Web UI Parity

## Test Goals

1. Verify that the remote reader still supports the existing functional workflows.
2. Verify that management workflows are reachable from modal/drawer surfaces.
3. Verify that PDF export remains browser-safe.
4. Verify the visual acceptance gate with a wide-browser screenshot.

## Functional Coverage

### Reader

- select view
- select feed
- select entry
- fallback to view-wide entries when no feed is selected where applicable
- show loading state
- show empty state
- show entry details
- fetch full entry details on selection
- auto mark read behavior remains intentional

### Read / Unread

- mark selected entry read
- mark selected entry unread
- unread-only filter updates visible list
- unread count refresh is requested after mutations

### Refresh

- refresh selected feed
- refresh all feeds
- busy state prevents duplicate actions
- SSE/store refresh keeps reader state coherent

### Subscription Management

- open/close drawer without losing reader context
- create subscription
- preview subscription
- edit subscription title/category/view
- delete one subscription
- select multiple subscriptions
- batch update category/view
- batch delete

### Settings / RSSHub / Import Export

- open/close settings surface
- load settings
- update appearance and RSSHub custom URL where supported
- RSSHub precheck calls runtime client
- export data calls runtime client and presents result intentionally
- import data parses and submits payload
- malformed import input shows error state

### PDF Export

- PDF action is disabled when no entry is selected
- selected entry PDF action calls `runtimeClient.pdf.exportEntry(entryId)`
- busy state is visible
- returned blob triggers browser download
- error response shows visible failure state

## Suggested Test Files

- Existing:
  - `apps/desktop/layer/renderer/src/remote/entry-navigation.test.ts`
- Add if helpful:
  - `apps/desktop/layer/renderer/src/remote/remote-state.test.ts`
  - `apps/desktop/layer/renderer/src/remote/remote-actions.test.ts`
  - `apps/desktop/layer/renderer/src/remote/components/*.test.tsx`

Prefer extracting pure helpers for selection, grouping, labels, and action state so tests do not require brittle full DOM rendering.

## Verification Commands

Required:

```text
pnpm --filter @suhui/web exec vitest --run src/remote/entry-navigation.test.ts
pnpm --filter @suhui/web typecheck
pnpm --filter suhui build:render
```

If new focused tests are added:

```text
pnpm --filter @suhui/web exec vitest --run src/remote
```

If runtime client changes:

```text
pnpm exec vitest --config apps/desktop/layer/renderer/vitest.config.ts --run packages/internal/store/src/runtime/client.test.ts
```

If main HTTP/application routes change:

```text
pnpm --filter @suhui/electron-main test -- --run apps/desktop/layer/main/src/application apps/desktop/layer/main/src/remote
```

## Screenshot Verification

Capture a desktop/wide-browser screenshot of the remote endpoint.

Minimum viewport:

```text
1440x900
```

Acceptance checks:

- left subscription rail, middle entry list, and right reading pane are all visible
- no full-screen raw forms in the first screen
- no overlapping text or controls
- no primary blank canvas when entries are available
- no temporary debug banner styling
- controls look like compact desktop reader controls, not generic admin buttons

Mobile screenshot:

- desirable but not required for first-pass acceptance

## Known Non-gates

- Full Electron desktop integration parity is not tested.
- Native save dialogs are not tested for Web PDF export.
- `pnpm --filter @suhui/electron-main build` is not a required gate because existing project setup issues are documented outside this UI task.
