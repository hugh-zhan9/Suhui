---
slug: full-web-client
artifact: development-plan
status: approved
recommended_lane: build
---

# Development Plan: Full Web Client

## Phase 0: Baseline Inventory And Guardrails

1. Add an implementation checklist under `.loopx/workflows/full-web-client/` or a tracked task note.
2. Inventory IPC methods by first-version scope:
   - reading/entries
   - subscription create/update/delete/batch
   - feed preview/refresh/batch refresh
   - unread/read
   - settings/RSSHub
   - import/export
   - PDF export
3. Add route/service parity test scaffolding before extraction.
4. Confirm current tests pass for existing remote and application services.

Verification:

```text
pnpm --filter @suhui/electron-main test -- --run apps/desktop/layer/main/src/application apps/desktop/layer/main/src/remote
pnpm --filter @suhui/web test -- --run packages/internal/store/src/remote
```

Adjust commands to the repo's actual package test behavior during build.

## Phase 1: Application Service Extraction

Goal: move business logic out of IPC services into `apps/desktop/layer/main/src/application/*`.

### 1.1 Subscription Service

Extract:

- `createSubscription()` from `DbService.addFeed`
- `previewFeed()` if subscription flow needs preview before add
- `deleteByTargets()`
- `batchUpdateSubscriptions()`
- existing single update/delete/list methods

Acceptance:

- `SubscriptionApplicationService.createSubscription()` no longer imports `DbService`.
- IPC `db.addFeed` delegates to application service.
- HTTP `POST /api/subscriptions` delegates to the same method.

### 1.2 Feed Service

Extract from `DbService`:

- `buildPreviewData`
- `previewFeed`
- `refreshFeed`
- `refreshLocalSubscribedFeeds`

Acceptance:

- `FeedApplicationService.refreshFeed()` and `refreshAllFeeds()` preserve refresh logging, read-state retention, and broadcast behavior.
- IPC and HTTP refresh routes share the same service.

### 1.3 Entry / Unread Service

Expand:

- entry list filters: feed, feed list, unread, pagination cursor
- entry detail
- mark entries read/unread
- mark feed/view/list read/unread where first-version UI needs it

Acceptance:

- HTTP and IPC read-state mutations record sync events consistently.
- Unread counts derive from active visible entries as current remote service does.

### 1.4 Settings / RSSHub Service

Add services for:

- supported Web settings
- appearance if usable in Web
- RSSHub custom URL get/set
- RSSHub precheck
- discover RSSHub route passthrough

Desktop-only settings remain IPC-only and hidden from Web capabilities.

### 1.5 Import/Export Service

Add service methods for browser-safe data import/export.

Build must determine whether existing desired export is:

- sync snapshot export/import
- OPML-like feed import/export
- settings export/import

If multiple exist, implement the first-version product import/export route as the existing app-visible data-control workflow, and document any unsupported variants.

### 1.6 PDF Service

Extract `AppService.exportEntryAsPDF` into `application/pdf`.

Methods:

- `renderEntryPdf(input): Promise<Buffer>`
- optional `saveEntryPdf(input): Promise<{success}>` for Desktop dialog behavior

Acceptance:

- Desktop IPC can keep save dialog.
- Web HTTP returns `application/pdf` bytes.

## Phase 2: Adapter Refactor

### 2.1 IPC Adapters

Refactor IPC services to delegate to application services. Keep non-goal desktop methods unchanged.

Priority:

1. `db.ts`
2. `setting.ts`
3. `sync.ts`
4. `app.ts` PDF export path
5. `discover.ts` / `reader.ts` as needed for first-version workflows

### 2.2 HTTP Routes

Refactor remote server routing by domain.

Keep `RemoteServerManager` lifecycle and existing `/health`, `/status`, `/events`.

Add domain routes for:

- subscriptions
- feeds
- entries
- unread
- settings
- RSSHub
- import/export
- PDF
- discover

Acceptance:

- Existing remote API tests still pass.
- New route tests can inject service dependencies without initializing full DB where practical.

## Phase 3: Runtime Service Clients

Goal: renderer/store code stops manually branching across Electron/remote for first-version workflows.

### 3.1 Define Interfaces

Create runtime client interfaces for:

- entries
- subscriptions
- feeds
- unread
- settings
- RSSHub/discover
- import/export
- PDF
- events

### 3.2 Implement Desktop Client

Desktop client calls IPC.

### 3.3 Implement Remote Client

Remote client calls HTTP/SSE.

### 3.4 Migrate Store Actions

Replace direct branches in:

- `packages/internal/store/src/modules/entry/store.ts`
- `packages/internal/store/src/modules/subscription/store.ts`
- `packages/internal/store/src/modules/unread/store.ts`
- `packages/internal/store/src/modules/feed/store.ts`
- `packages/internal/store/src/remote/*`

Acceptance:

- First-version store operations call runtime clients.
- Existing `remoteSSEHandler` either becomes the `eventsClient` implementation or delegates to it.

## Phase 4: Full Web UI Entry

### 4.1 Runtime Bootstrap

Build a remote/full Web entry that:

- marks remote runtime
- provides remote runtime clients
- hydrates bootstrap data
- mounts the main app/router or a Web-safe shell around the main app modules

### 4.2 Capability Manifest

Fetch `/api/bootstrap` and hide/degrade unsupported controls.

Explicitly hide non-goals:

- tray
- open-at-login
- system fonts
- notifications
- native folder picker
- system proxy
- desktop integrations

### 4.3 Settings Integration

Enable settings pages needed for first-version scope:

- general settings that are browser-safe
- appearance where applicable
- data-control import/export
- RSSHub configuration
- PDF export configuration if needed without native folder picker

### 4.4 Legacy Remote Preservation

Keep current `remote-app.tsx` until full Web workflows pass. If `/` is switched to full Web, preserve old remote under a compatibility route/path unless user approves deletion.

## Phase 5: Feature Workflow Completion

Implement and verify end-to-end workflows:

1. Read entries and details.
2. Mark entry read/unread.
3. Mark feed/view/list read/unread if UI exposes it.
4. Add RSS subscription.
5. Edit subscription title/category/view.
6. Delete subscription.
7. Batch move/category/delete subscriptions.
8. Preview/refresh one feed.
9. Refresh all feeds.
10. Edit RSSHub custom URL and recover from missing config.
11. Import data.
12. Export data.
13. Export entry PDF from Web.
14. Disconnect/reconnect SSE and verify visible status.

## Phase 6: Verification And Hardening

1. Run targeted service tests.
2. Run remote HTTP route tests.
3. Run renderer/store tests for runtime clients.
4. Build renderer with remote entry.
5. Start Desktop dev app and manually/browser-test Web endpoint.
6. Confirm no auth prompts or read-only restrictions were introduced.

## Recommended Build Slices

Slice 1:

- Service extraction for subscription/feed/entry/unread
- IPC adapter parity
- Existing remote tests updated

Slice 2:

- HTTP route expansion for core reading/subscription/refresh/read-state
- Runtime clients for core store actions

Slice 3:

- Settings/RSSHub/import-export/PDF services and HTTP routes

Slice 4:

- Full Web entry migration and capability-gated settings UI

Slice 5:

- End-to-end workflow fixes and documentation

## Stop Conditions

Stop and ask before:

- Adding auth or permission gates
- Creating a top-level `apps/web` or `apps/server`
- Deleting `remote-app.tsx` / old remote entry
- Replacing local Postgres
- Adding first-version features beyond clarify scope
