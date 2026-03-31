# Suhui Remote Browser Access Design

Date: 2026-03-31

## Summary

This document defines the design for exposing a browser-accessible remote interface from a running `Suhui` desktop app instance.

When `Suhui` is running on a user's computer, the user wants to access the app remotely from a browser through `IP + port` on the same LAN or VPN. The remote browser interface is intended to be functionally equivalent to the desktop app over time, not a read-only companion.

The current repository is `desktop-only`, with the main product flow centered on:

- Electron main process
- renderer UI
- local Postgres
- IPC-driven application logic

This feature extends that architecture by adding a remote control plane, not by reviving the historical standalone web app as the primary product form.

## Confirmed Requirements

The following points were explicitly confirmed during brainstorming and are treated as product requirements for this design:

- Access scope is LAN or VPN only from the user's perspective.
- Access model is direct browser access via `IP + port`.
- The remote browser interface should eventually be close to full desktop capability.
- Remote access and desktop access should be treated as equal in authority.
- No additional authentication, password, access code, or privilege partition is required.
- No mandatory product restrictions should be introduced such as default-off access, forced private-network checks, random port assignment, or extra confirmation gates.
- The main consistency requirement is that the desktop app and remote browser must not diverge in data behavior.
- If the remote realtime event stream disconnects, the browser UI must clearly show that the connection is disconnected and must not pretend writes are succeeding.

These requirements intentionally prioritize convenience and equal-control remote access over hard security boundaries.

## Goals

- Allow a running `Suhui` desktop app to serve a browser-accessible remote UI over HTTP.
- Keep the Electron main process as the single source of truth for application state and writes.
- Allow desktop and browser clients to operate on the same data without behavioral drift.
- Reuse as much existing UI and domain behavior as practical without forcing the browser runtime to depend on Electron-only APIs.
- Create a path toward broad functional parity between desktop and remote browser usage.

## Non-Goals

- Building a separate cloud-hosted SaaS product.
- Reintroducing `apps/ssr` or a separate independently deployed web product as the primary architecture.
- Adding user/account-level permission tiers between desktop and remote browser access.
- Adding mandatory authentication gates or security controls that were explicitly rejected in requirement discussion.
- Solving general internet exposure, NAT traversal, or public-domain hosting in this phase.

## Current State

The current application architecture has these relevant properties:

- Core local-first behavior is already concentrated in the Electron main process.
- The main process owns database initialization, IPC services, and local feed refresh behavior.
- The renderer still contains some browser-oriented code paths, but the active desktop product depends on main-process services and Electron IPC.
- The current `web` build path is not a complete independent application because important runtime behavior, especially database access, depends on Electron-side capabilities.

This means the correct direction is not to "turn on" the existing web build as-is. The correct direction is to make the Electron main process expose a proper remote API and then connect a browser client to it.

## Recommended Approach

### Recommended Option

Build an embedded remote-access server inside the Electron main process and expose a browser client that consumes the same application capabilities through HTTP APIs and a realtime event stream.

Why this is recommended:

- It matches the current local-first architecture.
- It keeps one authoritative backend: Electron main + Postgres.
- It avoids duplicating business rules across desktop and browser runtimes.
- It gives the cleanest consistency model when both clients operate at the same time.

### Alternatives Considered

#### Option A: Make the existing renderer run directly in the browser

This looks attractive because some browser-compatible code already exists, but it is not the best fit.

Trade-offs:

- Pros: potentially higher UI reuse in the short term.
- Cons: the current renderer still assumes Electron and IPC in important places.
- Cons: core data behavior would still need a new remote bridge.
- Cons: it encourages hidden runtime branching and fragile dual-mode code.

This option is rejected as the primary architecture, though specific UI pieces may still be reused.

#### Option B: Remote desktop or window streaming

Trade-offs:

- Pros: minimal business-logic changes.
- Cons: poor UX for reading, scrolling, navigation, and text interactions.
- Cons: weak maintainability and weak browser-native behavior.
- Cons: not aligned with the long-term goal of broad functional parity.

This option is rejected.

## High-Level Architecture

The target architecture adds a remote-access layer while preserving the main process as the system authority.

### Core Principle

The Electron main process remains the only authoritative write coordinator.

Desktop renderer and remote browser are peer clients. Neither should own a separate business-truth path.

### Architectural Shape

- Electron main process hosts:
  - local database access
  - refresh jobs
  - subscription management
  - settings persistence
  - remote HTTP server
  - realtime event broadcaster
- Desktop renderer talks to main process through IPC.
- Remote browser talks to main process through HTTP + realtime stream.
- Shared application service layer sits underneath both IPC and HTTP adapters.

## Main Design Decision

The system should be refactored toward:

`Application Services <- adapters: IPC / HTTP <- clients: Desktop Renderer / Remote Browser`

Instead of:

`Renderer-specific behavior + IPC-only business flow + ad hoc browser compatibility`

This is the most important design rule in the entire feature.

## Components

### 1. Application Services

This is the core shared business layer extracted from existing main-process and IPC logic.

Responsibilities:

- read subscriptions, entries, unread counts, settings
- mutate read state
- refresh individual feeds and batch refreshes
- create, update, delete subscriptions
- perform settings writes
- coordinate long-running tasks such as refresh/import/export
- publish domain events after state changes

Rules:

- Desktop IPC handlers and remote HTTP handlers both call this layer.
- No business rule should exist only in the desktop renderer.
- Direct remote DB access from the browser is not allowed.

### 2. Remote Server

An embedded server hosted by the Electron main process.

Responsibilities:

- bind and listen on a configured host and port
- serve remote browser assets
- expose JSON APIs
- expose a realtime event channel
- report status for diagnostics and UI display

Expected transport:

- HTTP for request/response APIs
- Server-Sent Events or WebSocket for event broadcast

The recommendation is to start with:

- REST-like HTTP APIs
- SSE for one-way server-to-client event delivery

Reason:

- Most client synchronization here is server-push only.
- SSE is simpler to operate for event fanout.
- Browser support and debugging are straightforward.

If later bidirectional streaming is needed for richer control semantics, the transport can be upgraded or supplemented with WebSocket.

### 3. Remote API Layer

An adapter layer that translates remote HTTP requests into application-service calls.

Expected domains:

- `session/status`
- `feeds`
- `subscriptions`
- `entries`
- `unread`
- `refresh`
- `settings`
- `lists`
- `collections`
- `integration`
- `data-control`
- `events`

The API should not mirror renderer internals. It should mirror domain operations.

### 4. Event Broadcast Layer

A main-process event bus for all state-changing operations.

Responsibilities:

- publish domain events after successful writes
- fan out events to:
  - desktop renderer bridge
  - remote browser stream
- support query invalidation or incremental state updates on clients

Representative events:

- `subscription.created`
- `subscription.updated`
- `subscription.deleted`
- `entry.read.updated`
- `feed.refreshed`
- `refresh.started`
- `refresh.finished`
- `settings.updated`
- `data.import.started`
- `data.import.finished`

### 5. Remote Browser App

A browser-targeted client that reuses existing UI where practical but uses remote APIs instead of Electron IPC and preload assumptions.

Responsibilities:

- render the app in browser form
- load initial state from remote APIs
- maintain client-side caches
- consume realtime domain events
- clearly indicate disconnected realtime state

It should not:

- directly open the local DB
- assume `window.electron`
- depend on Electron-only UI capabilities

## Functional Scope

The product goal is near-equal authority and broad feature coverage. To keep delivery realistic, implementation should still be staged.

### Phase 1

Phase 1 establishes the full remote-access skeleton and the highest-value product flows:

- subscription tree and unread counts
- entry list and entry detail reading
- mark read / unread and batch read operations
- feed refresh and all-feeds refresh
- add/edit/delete subscriptions
- main reading-related settings
- remote server status visibility
- realtime synchronization between desktop and browser

### Phase 2

Phase 2 expands the remote surface toward deeper parity:

- import and export
- more settings pages
- integration pages and related actions
- advanced data-control behavior
- Electron-specific behaviors mapped to browser equivalents
- browser-side replacements for features currently implemented through `webview` or native dialogs

### Parity Rule

The target is not permanent "core-only remote mode." The long-term direction is broad parity. Phase boundaries are delivery sequencing, not product limitations.

## Consistency Model

This section is mandatory because it determines whether desktop and browser can safely operate at the same time.

### Source of Truth

- Postgres remains the persistent source of truth.
- Electron main process remains the application source of truth for writes, job coordination, and emitted state changes.

### Write Path

All writes must go through main-process application services.

That includes:

- desktop-originated writes from IPC
- browser-originated writes from HTTP

No client should implement an alternative direct-write path that bypasses the shared service layer.

### Read Path

Reads may be served through optimized API handlers, but they must represent the same domain truth as desktop usage.

### Synchronization

After successful writes:

- the main process persists changes
- publishes domain events
- all connected clients receive those events
- clients invalidate or update local state

### Long-Running Operations

Operations such as feed refresh, bulk refresh, import, export, or data maintenance should be coordinated in the main process.

Expectations:

- avoid duplicated concurrent work where possible
- provide operation status events
- ensure clients converge on the same final state

### Disconnection Requirement

If the remote realtime event stream disconnects:

- the remote UI must clearly indicate the disconnected state
- the UI must not pretend writes are succeeding
- the UI may degrade to degraded connectivity mode, but the state must be explicit

This is the one explicit hard runtime constraint preserved from brainstorming.

## Equal Authority Model

The remote browser and desktop app are intentionally equal in authority.

Implications:

- the same mutations should be available remotely and locally unless a feature is physically impossible in a browser
- there is no product-level role split such as "viewer" vs "controller"
- there is no mandatory second confirmation model added just because an action is remote

Where a browser cannot perform the identical desktop behavior, the system should provide the nearest explicit browser-native equivalent rather than silently removing the capability.

Examples:

- native file picker can map to browser upload/download flows
- `webview`-based content can map to `iframe` or explicit external opening behavior
- native OS settings integrations can map to status display or remote-triggered app-side execution where appropriate

## Error Handling

### Server Startup

Remote server startup should report:

- listening host
- listening port
- startup failures
- bind conflicts

These should be visible in the desktop app so the user can tell whether the remote endpoint is actually available.

### Request Failures

API responses should return explicit domain errors rather than renderer-specific assumptions.

Examples:

- feed not found
- refresh already in progress
- unsupported browser-side capability mapping
- data import/export failure

### Connection Loss

When the browser loses the event stream:

- show a strong disconnected banner or status region
- block or visibly fail writes that require live coordination
- allow reconnect attempts
- resynchronize relevant queries after reconnect

### Desktop Shutdown

If the desktop app exits while a browser is connected:

- the browser should surface loss of connection clearly
- stale optimistic state must not be left looking committed

## UI and UX Notes

The remote UI should feel like the same product, not a debug panel.

Recommended UI principles:

- keep the same information architecture where practical
- favor shared components and visual patterns
- expose the current connected device endpoint in a subtle diagnostics area
- show a clear remote-connection state indicator
- avoid browser-specific regressions where desktop concepts can map cleanly

The browser app may still need targeted layout adjustments for common tablet/laptop browser usage.

## Testing Strategy

The testing strategy must cover both correctness and multi-client consistency.

### Unit Tests

- application service behavior
- domain event emission
- refresh task coordination
- transport-independent write behavior

### Integration Tests

- HTTP handlers calling shared services
- desktop IPC handlers calling the same shared services
- event stream delivery
- reconnect and resync flow

### End-to-End Tests

- desktop client writes, browser reflects update
- browser writes, desktop reflects update
- feed refresh status convergence across both clients
- disconnected event stream handling
- import/export flows once added remotely

### Regression Focus

Special attention should be paid to:

- unread counts
- read-state preservation after refresh
- duplicate refresh execution
- settings synchronization
- mixed desktop/browser simultaneous operations

## Migration and Implementation Notes

The main risk is not the embedded server itself. The main risk is business logic being split between:

- renderer-only assumptions
- IPC handlers
- remote HTTP handlers

To avoid this:

- move business behavior downward into reusable application services
- keep IPC and HTTP as thin adapters
- treat the remote browser app as another first-class client, not a debug shortcut

This feature should be implemented incrementally, but each increment should move the codebase toward that service-centered shape.

## Open Product Constraints

These are intentionally resolved, not pending:

- No extra authentication is required.
- No additional privilege partition is required.
- No mandatory remote-only confirmation gates are required.
- Remote and desktop should be equal in authority.

This design does not reinterpret or override those choices.

## Decision Summary

The system will be designed as:

- a running Electron desktop app
- hosting an embedded remote HTTP server
- backed by a shared main-process application service layer
- serving a browser client
- synchronizing all state changes through domain events

This is the most coherent way to deliver browser remote access without creating two separate products or two competing write paths.
