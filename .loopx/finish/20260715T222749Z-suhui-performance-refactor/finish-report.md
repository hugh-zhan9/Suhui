# Finish Audit

## Summary

- audit_id: 20260715T222749Z-suhui-performance-refactor
- slug: suhui-performance-refactor
- status: choice-recorded
- updated_at: 2026-07-15T22:28:29.227Z
- branch: main
- base branch: main
- worktree: /Users/zhangyukun/project/Suhui

## Scanned Inputs

- slug=suhui-performance-refactor
- worktree=/Users/zhangyukun/project/Suhui
- branch=main
- base_branch=main
- head=c3064c255
- change_window_source=baseline
- change_range=01f18d7..HEAD
- committed_change_count=7
- changed_files_count=170
- uncommitted_change_count=5
- cwd=/Users/zhangyukun/project/Suhui
- env.LOOPX_DEVELOPER=unknown

## Change Window

- source: baseline
- baseline_ref: 01f18d7
- requirement_start_commit: 01f18d7
- requirement_start_source: execution-range
- final_HEAD: c3064c2
- range: 01f18d7..HEAD
- committed_change_count: 7

### Commits

- c3064c2550bc56b6ae1020e10b79ad2b1e5d0321 test: close performance review evidence gaps
- 08c90df32ae76e095c960c9de854464c9974552c perf: enforce production performance gates
- 95a5e62b691ad44e652061a90841e07bacb2d50b perf: lazy-load renderer and stabilize sidebar
- 52195684da1769f0728454761914a2cbc4a4c8ab perf: progressively bootstrap remote readers
- 375aca3f4917d00a01c80d3da55f41b946640e48 perf: dedupe refresh changesets
- a857b487b616f9a279de643c5ba903e8539ee3b3 perf: bound desktop startup hydration
- b89c7121b8720d150e73aacbb2c8efc59068d550 refactor: bound entry queries and renderer pages

### Changed Files

- M apps/desktop/configs/vite.electron-render.config.d.ts
- M apps/desktop/configs/vite.electron-render.config.js
- M apps/desktop/configs/vite.electron-render.config.ts
- M apps/desktop/forge.config.cts
- M apps/desktop/layer/main/src/application/agent/service.test.ts
- M apps/desktop/layer/main/src/application/agent/service.ts
- M apps/desktop/layer/main/src/application/agent/types.ts
- A apps/desktop/layer/main/src/application/entry/entry-query-transport.pg.test.ts
- A apps/desktop/layer/main/src/application/entry/query-builder.ts
- A apps/desktop/layer/main/src/application/entry/query-cursor.ts
- A apps/desktop/layer/main/src/application/entry/query-service.test.ts
- A apps/desktop/layer/main/src/application/entry/query-service.ts
- A apps/desktop/layer/main/src/application/entry/query-types.ts
- M apps/desktop/layer/main/src/application/entry/service.ts
- M apps/desktop/layer/main/src/application/unread/service.test.ts
- M apps/desktop/layer/main/src/application/unread/service.ts
- M apps/desktop/layer/main/src/ipc/services/db.test.ts
- M apps/desktop/layer/main/src/ipc/services/db.ts
- M apps/desktop/layer/main/src/manager/feed-refresh.ts
- M apps/desktop/layer/main/src/manager/local-feed-refresh-events.test.ts
- M apps/desktop/layer/main/src/manager/local-feed-refresh-events.ts
- M apps/desktop/layer/main/src/manager/refresh-audit-log.test.ts
- M apps/desktop/layer/main/src/manager/refresh-audit-log.ts
- M apps/desktop/layer/main/src/remote/manager.test.ts
- M apps/desktop/layer/main/src/remote/manager.ts
- A apps/desktop/layer/main/src/remote/shell.test.ts
- M apps/desktop/layer/main/src/remote/shell.ts
- A apps/desktop/layer/main/src/startup-read-trace.test.ts
- A apps/desktop/layer/main/src/startup-read-trace.ts
- A apps/desktop/layer/renderer/src/@types/sidebar-owner-hooks.d.ts
- M apps/desktop/layer/renderer/src/App.tsx
- A apps/desktop/layer/renderer/src/atoms/app.test.tsx
- M apps/desktop/layer/renderer/src/atoms/app.ts
- M apps/desktop/layer/renderer/src/components/ui/code-highlighter/index.ts
- A apps/desktop/layer/renderer/src/components/ui/code-highlighter/lazy-code-highlighter.test.tsx
- A apps/desktop/layer/renderer/src/components/ui/code-highlighter/lazy-code-highlighter.tsx
- A apps/desktop/layer/renderer/src/generated-routes.test.ts
- M apps/desktop/layer/renderer/src/initialize/index.ts
- A apps/desktop/layer/renderer/src/initialize/initial-entries-prefetch.test.ts
- A apps/desktop/layer/renderer/src/initialize/initial-entries-prefetch.ts
- M apps/desktop/layer/renderer/src/initialize/readiness.test.ts
- M apps/desktop/layer/renderer/src/initialize/readiness.ts
- A apps/desktop/layer/renderer/src/initialize/startup-metrics.test.ts
- M apps/desktop/layer/renderer/src/initialize/startup-metrics.ts
- A apps/desktop/layer/renderer/src/initialize/startup-read-trace.test.ts
- A apps/desktop/layer/renderer/src/initialize/startup-read-trace.ts
- M apps/desktop/layer/renderer/src/initialize/startup-snapshot.test.ts
- M apps/desktop/layer/renderer/src/initialize/startup-snapshot.ts
- M apps/desktop/layer/renderer/src/lib/local-feed-refresh-sync.test.ts
- M apps/desktop/layer/renderer/src/lib/local-feed-refresh-sync.ts
- M apps/desktop/layer/renderer/src/lib/parse-html.ts
- A apps/desktop/layer/renderer/src/lib/query-client.test.ts
- M apps/desktop/layer/renderer/src/lib/query-client.ts
- A apps/desktop/layer/renderer/src/modules/command/command-manager.test.ts
- M apps/desktop/layer/renderer/src/modules/command/command-manager.ts
- M apps/desktop/layer/renderer/src/modules/command/hooks/use-command.ts
- M apps/desktop/layer/renderer/src/modules/command/registry/registry.ts
- M apps/desktop/layer/renderer/src/modules/entry-column/Items/video-item.tsx
- A apps/desktop/layer/renderer/src/modules/entry-column/PersistentEntryListBody.test.tsx
- A apps/desktop/layer/renderer/src/modules/entry-column/PersistentEntryListBody.tsx
- M apps/desktop/layer/renderer/src/modules/entry-column/context/EntriesContext.tsx
- A apps/desktop/layer/renderer/src/modules/entry-column/hooks/entries-query-props.ts
- A apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.test.ts
- M apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntriesByView.ts
- M apps/desktop/layer/renderer/src/modules/entry-column/hooks/useEntryMarkReadHandler.tsx
- D apps/desktop/layer/renderer/src/modules/entry-column/hooks/useLocalEntries.ts
- A apps/desktop/layer/renderer/src/modules/entry-column/hooks/visible-detail-prefetch.test.ts
- A apps/desktop/layer/renderer/src/modules/entry-column/hooks/visible-detail-prefetch.ts
- M apps/desktop/layer/renderer/src/modules/entry-column/index.tsx
- M apps/desktop/layer/renderer/src/modules/entry-column/layouts/EntryListHeader.tsx
- M apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.test.ts
- M apps/desktop/layer/renderer/src/modules/entry-column/layouts/entry-refresh.ts
- A apps/desktop/layer/renderer/src/modules/panel/cmdk.test.tsx
- M apps/desktop/layer/renderer/src/modules/panel/cmdk.tsx
- M apps/desktop/layer/renderer/src/modules/subscription-column/FeedCategory.tsx
- M apps/desktop/layer/renderer/src/modules/subscription-column/FeedItem.tsx
- M apps/desktop/layer/renderer/src/modules/subscription-column/SortedFeedItems.test.tsx
- M apps/desktop/layer/renderer/src/modules/subscription-column/SortedFeedItems.tsx
- M apps/desktop/layer/renderer/src/modules/subscription-column/SubscriptionTabButton.tsx
- M apps/desktop/layer/renderer/src/modules/subscription-column/index.tsx
- A apps/desktop/layer/renderer/src/modules/subscription-column/sidebar-derived-model.profile.test.tsx
- A apps/desktop/layer/renderer/src/modules/subscription-column/sidebar-derived-model.test.ts
- A apps/desktop/layer/renderer/src/modules/subscription-column/sidebar-derived-model.ts
- A apps/desktop/layer/renderer/src/modules/subscription-column/sidebar-owner-hooks.production.ts
- A apps/desktop/layer/renderer/src/modules/subscription-column/sidebar-owner-profile.instrumentation.ts
- M apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/SubscriptionList.tsx
- A apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/interaction-regression.test.tsx
- M apps/desktop/layer/renderer/src/modules/subscription-column/subscription-list/unread-count.test.ts
- M apps/desktop/layer/renderer/src/modules/subscription-column/timeline-switch.test.ts
- A apps/desktop/layer/renderer/src/modules/subscription-column/useStartupFrameDeferredMount.test.tsx
- A apps/desktop/layer/renderer/src/modules/subscription-column/useStartupFrameDeferredMount.ts
- R100 apps/desktop/layer/renderer/src/pages/(main)/(layer)/timeline/[timelineId]/[feedId]/index.sync.tsx
- R100 apps/desktop/layer/renderer/src/pages/(main)/(layer)/timeline/[timelineId]/[feedId]/layout.sync.tsx
- R090 apps/desktop/layer/renderer/src/pages/(main)/(layer)/timeline/[timelineId]/layout.sync.tsx
- R100 apps/desktop/layer/renderer/src/pages/(main)/layout.sync.tsx
- M apps/desktop/layer/renderer/src/providers/lazy/index.electron.ts
- M apps/desktop/layer/renderer/src/providers/lazy/index.ts
- M apps/desktop/layer/renderer/src/providers/local-feed-refresh-sync-provider.tsx
- A apps/desktop/layer/renderer/src/providers/renderer-boundaries.test.ts
- M apps/desktop/layer/renderer/src/providers/root-providers.tsx
- M apps/desktop/layer/renderer/src/remote/entry-navigation.test.ts
- M apps/desktop/layer/renderer/src/remote/main.tsx
- M apps/desktop/layer/renderer/src/remote/remote-app.tsx
- A apps/desktop/layer/renderer/src/remote/remote-bootstrap.test.tsx
- A apps/desktop/layer/renderer/src/remote/remote-bootstrap.tsx
- A apps/desktop/layer/renderer/src/remote/remote-performance.test.ts
- A apps/desktop/layer/renderer/src/remote/remote-performance.ts
- M apps/desktop/layer/renderer/src/remote/remote.css
- M apps/desktop/layer/renderer/vitest.config.ts
- M apps/desktop/package.json
- A apps/desktop/scripts/assert-sidebar-profile-elided.mjs
- A apps/desktop/scripts/assert-sidebar-profile-elided.test.mjs
- M apps/desktop/scripts/forge-ignore.test.ts
- M apps/desktop/scripts/forge-ignore.ts
- M apps/desktop/scripts/packaging/rsshub-removed.test.ts
- A apps/desktop/scripts/performance/artifact.test.ts
- A apps/desktop/scripts/performance/build-identity.ts
- A apps/desktop/scripts/performance/collect-evidence.ts
- A apps/desktop/scripts/performance/contracts.ts
- A apps/desktop/scripts/performance/evidence.ts
- A apps/desktop/scripts/performance/fixture.test.ts
- A apps/desktop/scripts/performance/fixture.ts
- A apps/desktop/scripts/performance/package-artifact.test.ts
- A apps/desktop/scripts/performance/package-artifact.ts
- A apps/desktop/scripts/performance/prior-evidence.v1.json
- A apps/desktop/scripts/performance/query-plan-test-fixtures.ts
- A apps/desktop/scripts/performance/query-plan.test.ts
- A apps/desktop/scripts/performance/query-plan.ts
- A apps/desktop/scripts/performance/report.test.ts
- A apps/desktop/scripts/performance/report.ts
- A apps/desktop/scripts/performance/run-desktop.test.ts
- A apps/desktop/scripts/performance/run-desktop.ts
- A apps/desktop/scripts/performance/run-remote.ts
- A apps/desktop/scripts/performance/stats.test.ts
- A apps/desktop/scripts/performance/stats.ts
- A apps/desktop/scripts/performance/verify-artifacts.ts
- M packages/internal/database/src/services/entry.test.ts
- M packages/internal/database/src/services/entry.ts
- A packages/internal/database/src/startup-read-trace.test.ts
- A packages/internal/database/src/startup-read-trace.ts
- A packages/internal/shared/src/entry-change.ts
- M packages/internal/store/src/hydrate.test.ts
- M packages/internal/store/src/hydrate.ts
- M packages/internal/store/src/modules/entry/base.ts
- A packages/internal/store/src/modules/entry/change-invalidation.test.ts
- A packages/internal/store/src/modules/entry/change-invalidation.ts
- A packages/internal/store/src/modules/entry/hooks.prefetch.test.tsx
- M packages/internal/store/src/modules/entry/hooks.test.ts
- M packages/internal/store/src/modules/entry/hooks.ts
- A packages/internal/store/src/modules/entry/store.projection.test.ts
- M packages/internal/store/src/modules/entry/store.ts
- M packages/internal/store/src/modules/entry/types.ts
- A packages/internal/store/src/modules/feed/store.restore.test.ts
- M packages/internal/store/src/modules/subscription/hooks.ts
- M packages/internal/store/src/modules/subscription/store.ts
- M packages/internal/store/src/modules/unread/invalidate-entries.test.ts
- M packages/internal/store/src/modules/unread/invalidate-entries.ts
- M packages/internal/store/src/modules/unread/store.ts
- A packages/internal/store/src/remote/bootstrap.test.ts
- A packages/internal/store/src/remote/bootstrap.ts
- D packages/internal/store/src/remote/hydrate.ts
- M packages/internal/store/src/remote/index.ts
- A packages/internal/store/src/remote/sse-handler.test.ts
- M packages/internal/store/src/remote/sse-handler.ts
- M packages/internal/store/src/remote/transforms.test.ts
- M packages/internal/store/src/remote/transforms.ts
- M packages/internal/store/src/runtime/client.test.ts
- M packages/internal/store/src/runtime/client.ts
- M packages/internal/store/src/runtime/index.ts
- M packages/internal/utils/src/jotai.ts

### Tracked Status

- M .gitignore
- M .idea/Suhui.iml
- M .vscode/settings.json

### Untracked Status

- ?? docs/loopx/design/2026-07-13-suhui-performance-refactor/
- ?? docs/loopx/plans/2026-07-13-suhui-performance-refactor/

### Uncommitted Status

- M .gitignore
- M .idea/Suhui.iml
- M .vscode/settings.json
- ?? docs/loopx/design/2026-07-13-suhui-performance-refactor/
- ?? docs/loopx/plans/2026-07-13-suhui-performance-refactor/

### Source Artifacts

- docs/loopx/plans/2026-07-13-suhui-performance-refactor/00-overview.md

### Diff Stat

- .../configs/vite.electron-render.config.d.ts | 17 +-
- .../desktop/configs/vite.electron-render.config.js | 10 +
- .../desktop/configs/vite.electron-render.config.ts | 11 +
- apps/desktop/forge.config.cts | 29 +-
- .../main/src/application/agent/service.test.ts | 221 ++---
- .../layer/main/src/application/agent/service.ts | 188 +----
- .../layer/main/src/application/agent/types.ts | 19 +-
- .../entry/entry-query-transport.pg.test.ts | 478 +++++++++++
- .../main/src/application/entry/query-builder.ts | 180 +++++
- .../main/src/application/entry/query-cursor.ts | 57 ++
- .../src/application/entry/query-service.test.ts | 329 ++++++++
- .../main/src/application/entry/query-service.ts | 164 ++++
- .../main/src/application/entry/query-types.ts | 88 ++
- .../layer/main/src/application/entry/service.ts | 46 +-
- .../main/src/application/unread/service.test.ts | 179 ++++-
- .../layer/main/src/application/unread/service.ts | 131 +--
- .../desktop/layer/main/src/ipc/services/db.test.ts | 360 ++++++++-
- apps/desktop/layer/main/src/ipc/services/db.ts | 176 ++--
- .../desktop/layer/main/src/manager/feed-refresh.ts | 8 +-
- .../src/manager/local-feed-refresh-events.test.ts | 149 +++-
- .../main/src/manager/local-feed-refresh-events.ts | 49 +-
- .../main/src/manager/refresh-audit-log.test.ts | 73 +-
- .../layer/main/src/manager/refresh-audit-log.ts | 156 +++-
- apps/desktop/layer/main/src/remote/manager.test.ts | 735 +++++++++++++++--
- apps/desktop/layer/main/src/remote/manager.ts | 547 +++++++++++--
- apps/desktop/layer/main/src/remote/shell.test.ts | 886 +++++++++++++++++++++
- apps/desktop/layer/main/src/remote/shell.ts | 447 +++++++++--
- .../layer/main/src/startup-read-trace.test.ts | 23 +
- apps/desktop/layer/main/src/startup-read-trace.ts | 17 +
- .../renderer/src/@types/sidebar-owner-hooks.d.ts | 16 +
- apps/desktop/layer/renderer/src/App.tsx | 8 +-
- apps/desktop/layer/renderer/src/atoms/app.test.tsx | 105 +++
- apps/desktop/layer/renderer/src/atoms/app.ts | 17 +-
- .../src/components/ui/code-highlighter/index.ts | 1 +
- .../lazy-code-highlighter.test.tsx | 72 ++
- .../ui/code-highlighter/lazy-code-highlighter.tsx | 44 +
- .../layer/renderer/src/generated-routes.test.ts | 30 +
- .../desktop/layer/renderer/src/initialize/index.ts | 11 +-
- .../initialize/initial-entries-prefetch.test.ts | 116 +++
- .../src/initialize/initial-entries-prefetch.ts | 62 ++
- .../renderer/src/initialize/readiness.test.ts | 62 ++
- .../layer/renderer/src/initialize/readiness.ts | 46 +-
- .../src/initialize/startup-metrics.test.ts | 65 ++
- .../renderer/src/initialize/startup-metrics.ts | 25 +-
- .../src/initialize/startup-read-trace.test.ts | 29 +
- .../renderer/src/initialize/startup-read-trace.ts | 10 +
- .../src/initialize/startup-snapshot.test.ts | 173 +++-
- .../renderer/src/initialize/startup-snapshot.ts | 91 ++-
- .../src/lib/local-feed-refresh-sync.test.ts | 86 +-
- .../renderer/src/lib/local-feed-refresh-sync.ts | 35 +-
- apps/desktop/layer/renderer/src/lib/parse-html.ts | 41 +-
- .../layer/renderer/src/lib/query-client.test.ts | 79 ++
- .../desktop/layer/renderer/src/lib/query-client.ts | 3 +
- .../src/modules/command/command-manager.test.ts | 185 +++++
- .../src/modules/command/command-manager.ts | 199 ++++-
- .../src/modules/command/hooks/use-command.ts | 17 +-
- .../src/modules/command/registry/registry.ts | 13 +-
- .../src/modules/entry-column/Items/video-item.tsx | 26 +-
- .../entry-column/PersistentEntryListBody.test.tsx | 70 ++
- .../entry-column/PersistentEntryListBody.tsx | 24 +
- .../entry-column/context/EntriesContext.tsx | 8 +-
- .../entry-column/hooks/entries-query-props.ts | 58 ++
- .../entry-column/hooks/useEntriesByView.test.ts | 491 ++++++++++++
- .../modules/entry-column/hooks/useEntriesByView.ts | 334 ++++----
- .../entry-column/hooks/useEntryMarkReadHandler.tsx | 50 +-
- .../modules/entry-column/hooks/useLocalEntries.ts | 159 ----
- .../hooks/visible-detail-prefetch.test.ts | 115 +++
- .../entry-column/hooks/visible-detail-prefetch.ts | 113 +++
- .../renderer/src/modules/entry-column/index.tsx | 72 +-
- .../entry-column/layouts/EntryListHeader.tsx | 6 +-
- .../entry-column/layouts/entry-refresh.test.ts | 348 ++++++--
- .../modules/entry-column/layouts/entry-refresh.ts | 67 +-
- .../layer/renderer/src/modules/panel/cmdk.test.tsx | 163 ++++
- .../layer/renderer/src/modules/panel/cmdk.tsx | 11 +-
- .../modules/subscription-column/FeedCategory.tsx | 32 +-
- .../src/modules/subscription-column/FeedItem.tsx | 2 +
- .../subscription-column/SortedFeedItems.test.tsx | 88 +-
- .../subscription-column/SortedFeedItems.tsx | 25 +-
- .../subscription-column/SubscriptionTabButton.tsx | 4 +
- .../src/modules/subscription-column/index.tsx | 29 +-
- .../sidebar-derived-model.profile.test.tsx | 142 ++++
- .../sidebar-derived-model.test.ts | 250 ++++++
- .../subscription-column/sidebar-derived-model.ts | 162 ++++
- .../sidebar-owner-hooks.production.ts | 3 +
- .../sidebar-owner-profile.instrumentation.ts | 43 +
- .../subscription-list/SubscriptionList.tsx | 105 ++-
- .../interaction-regression.test.tsx | 714 +++++++++++++++++
- .../subscription-list/unread-count.test.ts | 42 +-
- .../subscription-column/timeline-switch.test.ts | 12 +-
- .../useStartupFrameDeferredMount.test.tsx | 184 +++++
- .../useStartupFrameDeferredMount.ts | 59 ++
- .../[feedId]/{index.tsx => index.sync.tsx} | 0
- .../[feedId]/{layout.tsx => layout.sync.tsx} | 0
- .../[timelineId]/{layout.tsx => layout.sync.tsx} | 6 +-
- .../pages/(main)/{layout.tsx => layout.sync.tsx} | 0
- .../renderer/src/providers/lazy/index.electron.ts | 1 +
- .../layer/renderer/src/providers/lazy/index.ts | 5 +
- .../providers/local-feed-refresh-sync-provider.tsx | 30 +-
- .../src/providers/renderer-boundaries.test.ts | 58 ++
- .../renderer/src/providers/root-providers.tsx | 5 +-
- .../renderer/src/remote/entry-navigation.test.ts | 25 +
- apps/desktop/layer/renderer/src/remote/main.tsx | 39 +-
- .../layer/renderer/src/remote/remote-app.tsx | 209 +++--
- .../renderer/src/remote/remote-bootstrap.test.tsx | 296 +++++++
- .../layer/renderer/src/remote/remote-bootstrap.tsx | 89 +++
- .../renderer/src/remote/remote-performance.test.ts | 49 ++
- .../renderer/src/remote/remote-performance.ts | 53 ++
- apps/desktop/layer/renderer/src/remote/remote.css | 64 +-
- apps/desktop/layer/renderer/vitest.config.ts | 4 +
- apps/desktop/package.json | 14 +
- .../scripts/assert-sidebar-profile-elided.mjs | 103 +++
- .../scripts/assert-sidebar-profile-elided.test.mjs | 38 +
- apps/desktop/scripts/forge-ignore.test.ts | 30 +-
- apps/desktop/scripts/forge-ignore.ts | 39 +-
- .../scripts/packaging/rsshub-removed.test.ts | 8 +
- apps/desktop/scripts/performance/artifact.test.ts | 491 ++++++++++++
- apps/desktop/scripts/performance/build-identity.ts | 201 +++++
- .../scripts/performance/collect-evidence.ts | 77 ++
- apps/desktop/scripts/performance/contracts.ts | 104 +++
- apps/desktop/scripts/performance/evidence.ts | 540 +++++++++++++
- apps/desktop/scripts/performance/fixture.test.ts | 237 ++++++
- apps/desktop/scripts/performance/fixture.ts | 474 +++++++++++
- .../scripts/performance/package-artifact.test.ts | 136 ++++
- .../scripts/performance/package-artifact.ts | 185 +++++
- .../scripts/performance/prior-evidence.v1.json | 29 +
- .../performance/query-plan-test-fixtures.ts | 5 +
- .../desktop/scripts/performance/query-plan.test.ts | 310 +++++++
- apps/desktop/scripts/performance/query-plan.ts | 663 +++++++++++++++
- apps/desktop/scripts/performance/report.test.ts | 224 ++++++
- apps/desktop/scripts/performance/report.ts | 555 +++++++++++++
- .../scripts/performance/run-desktop.test.ts | 100 +++
- apps/desktop/scripts/performance/run-desktop.ts | 619 ++++++++++++++
- apps/desktop/scripts/performance/run-remote.ts | 350 ++++++++
- apps/desktop/scripts/performance/stats.test.ts | 76 ++
- apps/desktop/scripts/performance/stats.ts | 60 ++
- .../scripts/performance/verify-artifacts.ts | 166 ++++
- .../internal/database/src/services/entry.test.ts | 60 +-
- packages/internal/database/src/services/entry.ts | 18 +-
- .../database/src/startup-read-trace.test.ts | 31 +
- .../internal/database/src/startup-read-trace.ts | 20 +
- packages/internal/shared/src/entry-change.ts | 126 +++
- packages/internal/store/src/hydrate.test.ts | 47 +-
- packages/internal/store/src/hydrate.ts | 2 -
- packages/internal/store/src/modules/entry/base.ts | 6 +
- .../src/modules/entry/change-invalidation.test.ts | 701 ++++++++++++++++
- .../store/src/modules/entry/change-invalidation.ts | 337 ++++++++
- .../src/modules/entry/hooks.prefetch.test.tsx | 149 ++++
- .../internal/store/src/modules/entry/hooks.test.ts | 26 +-
- packages/internal/store/src/modules/entry/hooks.ts | 281 ++++---
- .../src/modules/entry/store.projection.test.ts | 151 ++++
- packages/internal/store/src/modules/entry/store.ts | 171 +++-
- packages/internal/store/src/modules/entry/types.ts | 31 +-
- .../store/src/modules/feed/store.restore.test.ts | 46 ++
- .../store/src/modules/subscription/hooks.ts | 81 +-
- .../store/src/modules/subscription/store.ts | 5 +-
- .../src/modules/unread/invalidate-entries.test.ts | 39 +-
- .../store/src/modules/unread/invalidate-entries.ts | 27 +-
- .../internal/store/src/modules/unread/store.ts | 6 +-
- .../internal/store/src/remote/bootstrap.test.ts | 276 +++++++
- packages/internal/store/src/remote/bootstrap.ts | 104 +++
- packages/internal/store/src/remote/hydrate.ts | 124 ---
- packages/internal/store/src/remote/index.ts | 14 +-
- .../internal/store/src/remote/sse-handler.test.ts | 515 ++++++++++++
- packages/internal/store/src/remote/sse-handler.ts | 153 ++--
- .../internal/store/src/remote/transforms.test.ts | 149 +++-
- packages/internal/store/src/remote/transforms.ts | 170 +++-
- packages/internal/store/src/runtime/client.test.ts | 111 ++-
- packages/internal/store/src/runtime/client.ts | 412 ++++++----
- packages/internal/store/src/runtime/index.ts | 2 +-
- packages/internal/utils/src/jotai.ts | 1 +
- 170 files changed, 20269 insertions(+), 2315 deletions(-)

## Extraction Candidates

- none

## Accepted Candidates

- none

## Rejected Candidates

- none

## No Candidates Reason

- No accepted or rejected candidates were recorded at audit start.

## Choice

- action: keep
- status: pending
- summary: Implementation is committed on main and spec final review passed 30/30. No memory or spec delta candidates. Done recording is pending only because pre-existing tracked user changes in .gitignore, .vscode/settings.json, and .idea/Suhui.iml must remain untouched.
- url: null

## Choice History

- none

## Next Steps

- Agent review the audit evidence and decide whether the finish state can advance.
- Record the final audit decision once the audit is complete.
