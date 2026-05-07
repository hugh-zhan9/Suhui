---
slug: full-web-client
artifact: architecture
status: approved
---

# Architecture: Full Web Client

## Target Shape

```text
apps/desktop/layer/main/src/application
  entry
  feed
  subscription
  unread
  settings
  rsshub
  import-export
  pdf
  discover

IPC services
  thin adapters over application services

Remote HTTP/SSE server
  thin adapters over application services

Renderer/store runtime clients
  desktop implementation -> IPC
  remote implementation -> HTTP/SSE
```

Electron main is the only write coordinator. Local Postgres remains the persistent source of truth.

## Application Services

Application services should be plain TypeScript classes/functions under `apps/desktop/layer/main/src/application/*`. They may use database services, managers, and Electron main capabilities where required, but they must not depend on IPC context.

### Service Domains

| Domain          | Responsibilities                                                                  | Extraction Sources                                                                         |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `subscription`  | list, create, update, delete, batch update, delete by targets                     | current `application/subscription`, `ipc/services/db.ts`, `SubscriptionService`            |
| `entry`         | list, detail, read/unread, batch read state, content/readability persistence      | current `application/entry`, `ipc/services/db.ts`, `EntryService`                          |
| `feed`          | preview, refresh one, refresh all, batch refresh status/events                    | current `application/feed`, `ipc/services/db.ts`, `FeedRefreshService`                     |
| `unread`        | unread count derivation and mutation support                                      | current `application/unread`, `UnreadService`, `EntryService`                              |
| `settings`      | Web-supported settings, appearance, RSSHub custom URL, PDF default/path semantics | `ipc/services/setting.ts`, renderer atoms/settings                                         |
| `rsshub`        | external RSSHub URL config, precheck, route discovery passthrough                 | `setting.ts`, RSSHub helper services, `discover.ts`                                        |
| `import-export` | browser download/upload endpoints for data import/export                          | `sync.ts`, sync export/import managers, OPML/data-control paths as discovered during build |
| `pdf`           | render entry HTML to PDF and return/download bytes                                | `AppService.exportEntryAsPDF`                                                              |
| `discover`      | trending/RSSHub route discovery where needed by subscription flow                 | `DiscoverService`, `discover-proxy`                                                        |

### Service Rules

- Each service method accepts explicit payloads and returns serializable results.
- No service method should require `IpcContext`.
- Service methods that mutate data publish domain events after successful writes.
- IPC and HTTP adapters do not duplicate validation beyond transport-level parsing.
- Service tests should not require a running renderer.

## IPC Adapter

Existing IPC services stay in `apps/desktop/layer/main/src/ipc/services/*` but shrink toward adapter code.

Example target:

```ts
@IpcMethod()
async addFeed(_context, input) {
  return subscriptionApplicationService.createSubscription(input)
}
```

Desktop-only IPC methods remain where appropriate, especially non-goals such as tray, window controls, system fonts, and system dialogs.

## HTTP Adapter

Refactor `apps/desktop/layer/main/src/remote/manager.ts` from a large inline handler into domain route modules while preserving `RemoteServerManager` lifecycle.

Suggested structure:

```text
apps/desktop/layer/main/src/remote
  manager.ts
  response.ts
  routes/
    entries.ts
    subscriptions.ts
    feeds.ts
    unread.ts
    settings.ts
    rsshub.ts
    import-export.ts
    pdf.ts
    discover.ts
  events.ts
```

Do not delete the existing remote entry without approval. It can remain as fallback or be routed behind a compatibility path.

## Proposed HTTP Surface

| Endpoint                               | Method       | Service                                                        |
| -------------------------------------- | ------------ | -------------------------------------------------------------- |
| `/health`                              | GET          | remote status                                                  |
| `/status`                              | GET          | remote status                                                  |
| `/events`                              | GET          | SSE                                                            |
| `/api/bootstrap`                       | GET          | aggregate subscriptions, feeds, unread, settings, capabilities |
| `/api/subscriptions`                   | GET/POST     | subscription                                                   |
| `/api/subscriptions/:id`               | PATCH/DELETE | subscription                                                   |
| `/api/subscriptions/batch`             | PATCH        | subscription batch                                             |
| `/api/subscriptions/delete-by-targets` | POST         | subscription batch delete                                      |
| `/api/entries`                         | GET          | entry                                                          |
| `/api/entries/:id`                     | GET          | entry                                                          |
| `/api/entries/read`                    | POST         | entry/unread                                                   |
| `/api/entries/read-batch`              | POST         | entry/unread                                                   |
| `/api/unread`                          | GET          | unread                                                         |
| `/api/feeds/preview`                   | POST         | feed                                                           |
| `/api/feeds/:feedId/refresh`           | POST         | feed                                                           |
| `/api/feeds/refresh-all`               | POST         | feed                                                           |
| `/api/settings`                        | GET/PATCH    | settings                                                       |
| `/api/settings/rsshub`                 | GET/PUT      | rsshub/settings                                                |
| `/api/rsshub/precheck`                 | POST         | rsshub                                                         |
| `/api/discover/*`                      | GET/POST     | discover                                                       |
| `/api/import`                          | POST         | import-export                                                  |
| `/api/export`                          | GET/POST     | import-export                                                  |
| `/api/entries/:id/pdf`                 | POST         | pdf                                                            |

Endpoint names can be refined during build, but the domain coverage must remain.

## Event Model

Current events are `entries.updated` and `subscriptions.updated`. Expand to a small typed taxonomy:

- `ready`
- `ping`
- `entries.updated`
- `subscriptions.updated`
- `feeds.refreshed`
- `unread.updated`
- `settings.updated`
- `import.completed`
- `export.completed`
- `error`

Remote clients must show disconnected state and must not optimistically claim writes succeeded after event-stream failure.

## Renderer Runtime Clients

Introduce stable client interfaces close to the store/action layer. A possible location is `packages/internal/store/src/runtime` if store modules need it, with renderer-specific implementations provided from `apps/desktop/layer/renderer/src/runtime`.

Required clients:

- `entryClient`
- `subscriptionClient`
- `feedClient`
- `unreadClient`
- `settingsClient`
- `rsshubClient`
- `importExportClient`
- `pdfClient`
- `discoverClient`
- `eventsClient`

Desktop implementation uses IPC. Remote implementation uses HTTP/SSE.

Store modules should gradually replace direct checks for `window.electron`, `getRuntimeEnv().isRemote`, and raw `/api/*` fetch calls.

## Web UI Migration

Use a staged migration:

1. Keep existing `remote-app.tsx` as the legacy remote client.
2. Build service/HTTP/runtime parity underneath it.
3. Introduce a full Web runtime entry that can mount the main app/router with remote clients.
4. Hide non-goal desktop/system sections through a runtime capability manifest.
5. Switch `/` to the full Web runtime only after parity workflows pass.
6. Keep legacy remote under a compatibility path until the user approves deletion.

## PDF Export Architecture

Desktop IPC may keep native save dialog behavior.

Web must use an HTTP download flow:

```text
remote browser -> POST /api/entries/:id/pdf -> Electron main renders PDF -> response bytes with application/pdf
```

The PDF service can reuse the existing hidden `BrowserWindow.printToPDF` implementation, but it should expose a transport-neutral method that returns a buffer or stream. Web does not require native file selection.

## Import/Export Architecture

Web must use browser-native upload/download:

- Export returns a downloadable file response.
- Import accepts `multipart/form-data` or JSON body depending on existing export format.
- Sync-manager operations that require local folder paths remain desktop-only unless already expressible without native picker.

## Capability Manifest

Remote bootstrap should include supported capabilities, e.g.:

```json
{
  "auth": "none",
  "pdfExport": true,
  "nativeFolderPicker": false,
  "tray": false,
  "systemNotifications": false,
  "rsshubConfig": true
}
```

UI should use capabilities to hide or degrade non-goal sections.

## Residual Risks

- Full UI may import Electron-only modules at module load time. Build must isolate or lazy-load those modules.
- Existing settings pages may contain mixed supported and unsupported controls.
- Import/export format may need discovery during build because current code has multiple settings/data-control paths.
