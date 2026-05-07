---
slug: full-web-client
artifact: test-spec
status: approved
source_plan: .loopx/workflows/full-web-client/test-plan.md
---

# Test Spec: Full Web Client

## Acceptance Matrix

| Requirement                   | Test Level               | Verification                                         |
| ----------------------------- | ------------------------ | ---------------------------------------------------- |
| Shared application services   | service + IPC + HTTP     | IPC and HTTP tests call same service-backed behavior |
| Reading                       | HTTP + runtime + manual  | list subscriptions, entries, detail                  |
| Subscription CRUD             | service + HTTP + manual  | create, edit, delete                                 |
| Batch subscription management | service + HTTP + manual  | batch category/view/delete                           |
| Refresh                       | service + HTTP + event   | refresh one/all and observe events                   |
| Read/unread                   | service + HTTP + runtime | mark read/unread and count updates                   |
| Settings                      | service + HTTP + UI      | supported settings render/update                     |
| Import/export                 | service + HTTP + manual  | browser upload/download                              |
| RSSHub config                 | service + HTTP + UI      | get/set/precheck                                     |
| PDF export                    | service + HTTP + manual  | browser downloads valid PDF                          |
| No auth                       | HTTP + manual            | no auth/access prompt                                |
| Non-goal hiding               | UI/manual                | desktop-only controls absent                         |
| Disconnection state           | SSE/manual               | offline state visible                                |

## Concrete Test Cases

### Services

1. `subscription.create` persists feed, subscription, entries, and dedupes duplicate feed.
2. `subscription.update` changes title/category/view.
3. `subscription.deleteByTargets` soft-deletes target subscriptions and records sync operation.
4. `subscription.batchUpdate` changes view/category for multiple feeds.
5. `feed.preview` fetches/parses feed and resolves RSSHub URL.
6. `feed.refreshOne` preserves existing read state.
7. `feed.refreshAll` returns total/refreshed/failed result.
8. `entry.list` filters by feed and unread state.
9. `entry.detail` excludes deleted/inactive entries.
10. `entry.updateReadStatus` persists read/unread.
11. `unread.listCounts` derives active source counts.
12. `settings.rsshub` get/set round trips.
13. `pdf.renderEntryPdf` returns PDF-like bytes for valid content.
14. `importExport.export` returns downloadable payload.
15. `importExport.import` rejects invalid payload and accepts valid payload.

### HTTP

1. `GET /api/bootstrap` returns subscriptions, feeds, unread, settings, capabilities.
2. `GET /api/subscriptions` returns current subscriptions.
3. `POST /api/subscriptions` creates subscription and emits `subscriptions.updated`.
4. `PATCH /api/subscriptions/:id` updates subscription.
5. `DELETE /api/subscriptions/:id` deletes subscription.
6. `PATCH /api/subscriptions/batch` batch updates subscriptions.
7. `GET /api/entries` returns entries with filters.
8. `GET /api/entries/:id` returns detail or null/404.
9. `POST /api/entries/read` mutates read state and emits entry/unread events.
10. `POST /api/feeds/:feedId/refresh` refreshes one feed.
11. `POST /api/feeds/refresh-all` refreshes all feeds.
12. `GET/PATCH /api/settings` handles supported settings.
13. `GET/PUT /api/settings/rsshub` handles RSSHub custom URL.
14. `POST /api/import` imports valid payload.
15. `GET/POST /api/export` exports valid payload.
16. `POST /api/entries/:id/pdf` returns `application/pdf`.

### Runtime Clients

1. Desktop runtime client calls IPC methods.
2. Remote runtime client calls HTTP endpoints.
3. Store actions for first-version workflows use runtime clients.
4. Remote event client reconnects and invalidates relevant caches.

### UI / Manual

1. Remote page loads from Desktop-hosted port.
2. User can read an article.
3. User can add/edit/delete a subscription.
4. User can batch manage subscriptions.
5. User can refresh feed/all.
6. User can mark read/unread.
7. User can edit RSSHub config.
8. User can import/export.
9. User can export PDF.
10. User sees offline state if SSE is interrupted.
11. User sees no auth prompt.
12. User does not see non-goal desktop/system controls.

## Suggested Commands

```text
pnpm --filter @suhui/electron-main test
pnpm --filter @suhui/web test
pnpm --filter suhui build:render
pnpm --filter suhui build:electron-vite
pnpm typecheck
```

The build lane should adjust commands to actual package scripts if these package filters differ in practice.
