---
slug: web-ui-parity
artifact: architecture
status: approved
decision: remote-specific-desktop-parity-shell
---

# Architecture: Web UI Parity

## ADR

### Decision

Implement the browser endpoint as a remote-specific desktop-parity shell that keeps the current Electron-main-hosted remote architecture and uses existing runtime/application-service contracts.

### Drivers

- The user wants desktop-consistent UI, not a rough Web admin surface.
- The current remote UI is functionally broad but visually and structurally separate from the desktop app.
- Full desktop-router reuse risks bringing non-goal Electron-only behavior into the browser endpoint.
- Application services and runtime adapters already exist and should remain the shared functional foundation.

### Alternatives Considered

1. Full desktop router/component mount in remote.
2. Cosmetic polish of the current remote UI.
3. Remote-specific desktop-parity shell.

### Why Chosen

The remote-specific shell gives the implementation agent enough control to produce a polished browser UI while preserving all hard architecture boundaries:

- no new top-level Web/server app
- no direct DB writes from browser
- no auth model change
- no broad desktop module deletion
- no first-pass Electron-native parity

### Consequences

- Some remote UI components will mirror desktop patterns rather than directly import them.
- Future parity work should consider extracting stable browser-safe primitives from desktop modules.
- Screenshot review becomes part of acceptance, because visual quality is central.

### Follow-ups

- After the first pass, evaluate whether subscription item, entry item, and settings section primitives can be shared safely.
- Add mobile screenshot gates in a later pass if the folded responsive experience becomes a product priority.

## Component Architecture

Recommended remote structure:

```text
apps/desktop/layer/renderer/src/remote/
  remote-app.tsx
  remote.css
  components/
    RemoteReaderShell.tsx
    RemoteSubscriptionRail.tsx
    RemoteEntryList.tsx
    RemoteReadingPane.tsx
    RemoteReaderToolbar.tsx
    RemoteManagementDrawer.tsx
    RemoteSettingsModal.tsx
    RemoteEmptyState.tsx
    RemoteStatusBadge.tsx
```

`remote-app.tsx` should become orchestration only:

- own selected view/feed/entry state
- own modal/drawer open state
- wire store hooks and runtime calls
- render `RemoteReaderShell`

## Data And Runtime Flow

Browser remote client:

```text
Remote UI -> @suhui/store/runtime runtimeClient -> Electron main HTTP routes -> application services -> local Postgres
```

Event flow:

```text
Electron main SSE -> remoteSSEHandler -> store refresh/invalidation -> Remote UI
```

No browser component should directly access DB services.

## UI Shell

Desktop/wide layout:

```text
┌────────────────────────────────────────────────────────────┐
│ Remote reader shell                                        │
├──────────────┬─────────────────────┬───────────────────────┤
│ Subscription │ Entry list          │ Reading pane           │
│ rail         │ + list toolbar      │ + article toolbar      │
│              │                     │                       │
└──────────────┴─────────────────────┴───────────────────────┘
```

Suggested widths:

- subscription rail: 256-300px, matching desktop feed column intent
- entry list: 340-420px
- reading pane: flexible, min-width protected

Mobile/folded layout:

- acceptable as a responsive degradation
- no first-pass hard screenshot gate
- must not overlap or expose raw desktop-incompatible controls

## Management Surfaces

Subscription management drawer:

- add subscription
- preview
- edit title/category/view
- delete single subscription
- select multiple feeds
- batch category/view update
- batch delete
- refresh selected or all

Settings modal/drawer:

- Web-safe appearance setting if supported by current runtime
- RSSHub custom URL and precheck
- import/export
- no system proxy, native folder picker, system fonts, notifications, startup, tray, or desktop integration controls

PDF export:

- entry toolbar action calls `runtimeClient.pdf.exportEntry(entryId)`
- browser downloads returned blob
- show busy/error state in the reading pane action area

## Desktop Reuse Guidance

Safe to mirror or selectively reuse:

- CSS variables and Tailwind token classes already loaded through `@suhui/components/tailwind`
- button/icon density and list item hierarchy
- settings modal structure and section rhythm
- entry title/meta/content hierarchy

Use caution with direct imports from:

- `modules/app-layout/MainDestopLayout.tsx`
- `modules/app-layout/subscription-column/SubscriptionColumn.tsx`
- `modules/subscription-column/index.tsx`
- full `modules/entry-content/EntryContent.tsx`

These may pull router, command, focus scope, Electron, DnD, player, update, or non-goal surfaces.

## Architect Review

Strongest steelman objection:

Remote-specific mirroring creates a second implementation of important reader UI. Over time, desktop and remote visual behavior can diverge.

Tradeoff:

- Full reuse improves long-term consistency but expands immediate compatibility risk.
- Mirroring reduces immediate risk but creates maintenance work.

Risk mitigation:

- Use the desktop app as a visual reference for layout anatomy and tokens.
- Keep component names and responsibilities aligned with desktop concepts.
- Prefer extracting narrow primitives once a component proves browser-safe.
- Add screenshot acceptance so rough UI cannot pass again.

Architect verdict: complete, approved with the above mitigations.
