---
slug: full-web-client
skill: clarify
profile: standard
created_at: 2026-05-07T22:40:57+08:00
current_round: 6
ambiguity_score: 0.12
non_goals_resolved: true
decision_boundaries_resolved: true
pressure_pass_complete: true
unresolved_ambiguity_count: 0
handoff_ready: true
recommended_next: plan
---

# Clarify Spec: Full Web Client

## Intent

Build a complete, well-architected browser-accessible Web endpoint for Suhui.

This is not a request to quickly polish the existing lightweight remote reader. The user wants a proper Web experience whose feature surface is broad enough to be treated as a real client, while still preserving the current desktop-local architecture.

## Desired Outcome

The running Desktop app exposes a full Web client over `IP + port`. The Web client should use Electron main as the authoritative service host and local Postgres as the single source of truth.

Target architecture:

```text
Electron main application services
  <- IPC adapter: desktop renderer
  <- HTTP/SSE adapter: browser Web endpoint
```

The correct implementation direction is to expand and organize `apps/desktop/layer/main/src/application/*` so that both IPC handlers and HTTP routes call the same application services.

## In Scope

First complete Web version must include:

- reading
- subscription create/update/delete
- batch subscription management
- refresh
- unread/read state
- settings pages
- import/export
- RSSHub configuration
- PDF export

Architectural work in scope:

- expand `apps/desktop/layer/main/src/application/*`
- route existing IPC behavior through application services where practical
- expose matching HTTP/SSE adapters for Web
- establish runtime service adapters for renderer/Web code
- make Web client a formal browser client, not only the existing lightweight `remote-app.tsx`
- preserve a single authoritative write path through Electron main

## Out Of Scope / Non-Goals

First version does not need to support:

- window controls
- tray behavior
- open-at-login controls
- system font enumeration
- Dock badge
- system notifications
- Eagle integration
- Obsidian integration
- qBittorrent integration
- native folder picker
- system-level proxy switching

This clarify spec also does not authorize:

- building an independently deployed `apps/server` product
- replacing local Postgres as the single source of truth
- adding authentication, access codes, or permissions in first version
- widening first-version functionality beyond the in-scope list without asking

## Decision Boundaries

The agent may decide during planning:

- application service split and naming
- IPC/HTTP adapter interface shape
- Web runtime adapter module boundaries
- whether the current lightweight remote UI is retained, replaced, or migrated
- test layering
- migration order

The agent must ask before:

- changing the no-auth model
- adding first-version feature scope
- introducing a new top-level app/package
- changing local Postgres as the single source of truth
- deleting the old remote entry
- large-scale removing existing modules

## Constraints

- Current repository is desktop-only; `apps/ssr` has been removed.
- Existing remote browser entry is lightweight and incomplete.
- The first version keeps no-auth remote access: any browser that can reach the configured `IP:port` has full Web permissions.
- The user explicitly accepted this no-auth risk after pressure testing.
- Web and desktop must not diverge in business behavior; shared application services are the main mechanism to prevent drift.
- Clarify itself does not implement the feature.

## Security Boundary

First version intentionally uses no authentication and no read-only mode.

Confirmed implication:

```text
Any browser that can reach the LAN/VPN endpoint can:
- modify subscriptions
- batch delete/move subscriptions
- trigger refresh
- modify settings
- import/export data
- export PDF
- mark read/unread
```

This is accepted for first version. UI may show connection/status clearly, but no permission protection is required.

## Success Criteria

Planning should produce a staged implementation path that:

- moves scattered IPC-backed behavior into reusable application services
- gives both IPC and HTTP access to the same service operations
- defines runtime service adapters for desktop renderer and Web runtime
- covers all first-version feature requirements
- keeps local Postgres authoritative
- keeps no-auth access unchanged
- identifies which existing IPC routes and renderer modules need migration
- includes verification strategy for service parity, HTTP routes, and Web workflows

## Brownfield Evidence

Evidence from current repo:

- `AI-CONTEXT.md` states only `apps/desktop` remains and `apps/ssr` has been removed.
- `AI-CONTEXT.md` states the current remote browser entry is `apps/desktop/layer/renderer/remote.html` and remote client code is under `apps/desktop/layer/renderer/src/remote`.
- `apps/desktop/layer/main/src/remote/manager.ts` already exposes remote HTTP routes for a partial reader/management surface.
- `apps/desktop/layer/main/src/application/*` already contains early application services for entry, feed, subscription, and unread.
- `packages/internal/database/src/db.desktop.ts` currently depends on Electron IPC for DB access.
- Existing renderer/store code contains direct `window.electron`, `ipcServices`, `isRemote`, and `/api/*` branching, which motivates runtime service adapters.

Inference:

- The current remote browser implementation is useful as a proof of transport and serving model, but is not a sufficient base by itself for a complete Web client.
- The most coherent path is shared service extraction inside Electron main, plus IPC/HTTP adapters, rather than reviving a standalone SSR app.

## Design Direction

Recommended direction:

1. Treat `apps/desktop/layer/main/src/application/*` as the shared domain/application service layer.
2. Refactor IPC handlers to delegate to application services.
3. Expand remote HTTP/SSE routes to delegate to the same application services.
4. Introduce renderer-side runtime clients so UI modules call capabilities through stable interfaces rather than directly branching on Electron/remote runtime.
5. Migrate or replace the lightweight remote UI toward a full Web client using the shared runtime clients.

Rejected direction for this task:

- Creating an independent `apps/server` + `apps/web` product as the primary goal.
- Merely adding more features to `src/remote/remote-app.tsx` without service-layer unification.

## Assumptions Resolved

- The Web endpoint depends on the running Desktop app and Electron main.
- The Web endpoint should be complete within the stated first-version scope.
- PDF export is included.
- Other Electron/system integrations listed under non-goals are deferred.
- No-auth access remains intentional for first version.

## Next Handoff

Recommended invocation:

```text
$plan full-web-client
```

Artifact-pinned invocation:

```text
$plan --direct .loopx/specs/clarify-full-web-client-20260507224057.md
```

Downstream consumer behavior:

Treat this clarify spec as the source of truth for intent, non-goals, decision boundaries, constraints, and design direction. Do not reopen clarification by default.
