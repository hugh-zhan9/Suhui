---
slug: full-web-client
artifact: test-plan
status: approved
---

# Test Plan: Full Web Client

## Test Strategy

Use layered verification:

1. Application service unit/integration tests for business behavior.
2. IPC adapter tests for Desktop compatibility.
3. Remote HTTP route tests for Web transport behavior.
4. Runtime client tests for Desktop/Remote client selection.
5. Renderer workflow tests for Web-safe UI behavior.
6. Manual/browser verification for end-to-end remote workflows.

## Application Service Tests

Add or extend tests under:

- `apps/desktop/layer/main/src/application/subscription`
- `apps/desktop/layer/main/src/application/feed`
- `apps/desktop/layer/main/src/application/entry`
- `apps/desktop/layer/main/src/application/unread`
- new `settings`, `rsshub`, `import-export`, `pdf`, `discover` service directories

Coverage:

- create subscription deduplicates existing feed
- create subscription persists feed/subscription/entries
- update subscription title/category/view
- delete by subscription id and by target sets
- batch update subscriptions
- feed preview resolves external RSSHub URL
- refresh preserves read state
- refresh all reports success/failure
- entry list filters by feed/unread and orders by published time
- entry detail hides soft-deleted/inactive entries
- read/unread mutations persist and update unread derivation
- settings/RSSHub get/set round trip
- PDF service returns non-empty PDF buffer from content HTML
- import/export services return or accept expected payload formats

## IPC Adapter Tests

Existing IPC tests should keep passing after adapters delegate to application services.

Target files:

- `apps/desktop/layer/main/src/ipc/services/db.test.ts`
- `db.preview-feed.test.ts`
- `rss-refresh.test.ts`
- `local-feed-refresh.test.ts`
- `rsshub-*.test.ts`
- `app.db-switch.test.ts`
- new tests for PDF adapter if needed

Assertions:

- IPC method result shape remains compatible with renderer.
- IPC methods do not duplicate extracted business logic.
- Desktop-only IPC methods remain available where non-goal features already rely on them.

## Remote HTTP Route Tests

Extend `apps/desktop/layer/main/src/remote/manager.test.ts` or add domain route tests.

Coverage:

- `/health`, `/status`, `/events`
- `/api/bootstrap`
- subscription CRUD
- batch subscription update/delete
- entries list/detail
- read/unread mutation
- unread counts
- feed preview
- single feed refresh
- refresh all
- settings get/patch
- RSSHub config get/put/precheck
- import/export route request and response behavior
- PDF route content type and non-empty bytes
- unsupported route returns structured 404
- invalid payload returns structured 400

SSE assertions:

- `subscriptions.updated` after create/update/delete/batch operations
- `entries.updated` and `unread.updated` after read/refresh
- `settings.updated` after settings/RSSHub change
- client cleanup on disconnect

## Runtime Client Tests

Add tests around runtime clients:

- Desktop client delegates to IPC.
- Remote client delegates to HTTP.
- Store actions use runtime clients instead of direct `window.electron` or raw `/api/*` branches for first-version workflows.
- Remote bootstrap hydrates subscriptions, feeds, unread, settings, and capabilities.
- Events client invalidates relevant queries/stores.

Candidate files:

- `packages/internal/store/src/runtime/*.test.ts`
- `packages/internal/store/src/remote/*.test.ts`
- existing store module tests where behavior changes.

## Renderer / Web Workflow Tests

Use component tests where available and browser/manual verification for full remote entry.

Workflow checklist:

- load remote URL and see connected status
- list subscriptions and unread counts
- open feed, list entries, read article detail
- mark read/unread
- add RSS feed
- edit subscription title/category/view
- delete subscription
- batch move/category/delete subscriptions
- refresh one feed
- refresh all feeds
- edit RSSHub custom URL
- import data
- export data
- export PDF
- disconnect SSE and see offline state
- reconnect and resync

Non-goal checks:

- no tray/open-at-login/system-font/system-notification/proxy/native-folder controls visible in Web runtime
- no authentication prompt is introduced
- no read-only restrictions are introduced

## Build And Typecheck Verification

Recommended commands to resolve during build:

```text
pnpm --filter suhui build:render
pnpm --filter suhui build:electron-vite
pnpm --filter @suhui/electron-main test
pnpm --filter @suhui/web test
pnpm typecheck
```

If package names or scripts differ in practice, use the closest existing scripts from `apps/desktop/package.json` and root `package.json`.

## Manual Acceptance Run

1. Start Desktop development app:

```text
pnpm --filter suhui dev:electron
```

2. Open remote endpoint:

```text
http://<machine-ip>:41595
```

3. Execute the workflow checklist above.
4. Confirm Desktop renderer reflects Web mutations after events/refetch.
5. Confirm Web reflects Desktop mutations after events/refetch.

## Regression Focus

- Read-state preservation after refresh.
- Unread count consistency across All/Articles/feed views.
- Subscription deduplication on add.
- Deleted subscriptions not lingering remotely.
- RSSHub unconfigured recovery path.
- PDF export with missing content fails clearly.
- Browser-side import rejects invalid payloads clearly.
