---
slug: web-ui-parity
artifact: clarify-spec
status: handoff-ready
profile: standard
current_round: 6
max_rounds: 15
ambiguity_score: 0.14
target_ambiguity_threshold: 0.20
non_goals_resolved: true
decision_boundaries_resolved: true
pressure_pass_complete: true
unresolved_ambiguity_count: 0
recommended_next: plan
---

# Clarify Spec: Web UI Parity

## Intent

Replace the current rough remote Web UI with a Web interface that feels consistent with the existing desktop app. The user explicitly rejects a crude visualization/admin panel. The desired result is a polished browser-accessible reader whose first impression and daily reading workflow match the desktop product.

## Desired Outcome

The Desktop-hosted Web endpoint should present a desktop-like RSS reader UI:

- left subscription/category column
- middle entry list
- right reading pane
- desktop-like visual tokens, density, typography, borders, hover/selected states, empty/loading/error states
- management features available through polished desktop-style modal or drawer surfaces instead of raw full-screen forms

This is UI parity for the browser endpoint, not a new deployment architecture.

## In Scope

- Rework `apps/desktop/layer/renderer/src/remote/remote-app.tsx` and related remote UI code so the first screen is a desktop-style three-pane reader.
- Strongly mirror or reuse existing desktop UI patterns from:
  - `apps/desktop/layer/renderer/src/modules/app-layout`
  - `apps/desktop/layer/renderer/src/modules/subscription-column`
  - `apps/desktop/layer/renderer/src/modules/entry-column`
  - `apps/desktop/layer/renderer/src/modules/entry-content`
  - `apps/desktop/layer/renderer/src/modules/settings`
- Keep existing Web feature scope available:
  - reading entries and details
  - read/unread
  - refresh one feed and all feeds
  - add/edit/delete subscriptions
  - batch subscription management
  - settings page surface for Web-safe settings
  - RSSHub configuration
  - import/export
  - PDF export
- Move subscription management, batch operations, settings/RSSHub, and import/export into desktop-style modal/drawer surfaces.
- Preserve browser-safe degradation where Electron-native behavior is unavailable.
- Add focused tests and screenshot-based verification sufficient to prevent another rough UI pass from being accepted.

## Out Of Scope / Non-goals

First pass must not include:

- window controls
- tray
- dock badge
- open-at-login controls
- system notifications
- system font enumeration
- native folder picker
- system proxy controls
- Electron menu parity
- full command palette / keyboard shortcut parity
- desktop integration entrypoints
- AI, translation, or summary online surfaces
- player or corner media window parity
- a new top-level Web app or server package
- a change to the no-auth remote access model

## Decision Boundaries

The implementation agent may decide:

- whether to rewrite `remote-app.tsx` in place or split it into remote-specific components
- whether to directly reuse desktop components or create Web-safe components that mirror their structure and style
- modal vs drawer details for management workflows
- toolbar/action-menu details where browser constraints make desktop context-menu parity expensive
- exact wide-screen layout dimensions, breakpoints, spacing, and empty-state copy
- focused tests and screenshot verification approach

The implementation agent must ask before:

- changing the Desktop-hosted Web architecture
- introducing a new top-level Web/server app
- deleting existing desktop UI modules
- adding first-pass non-goals back into scope
- changing the no-auth remote access model
- performing broad store/application-service rewrites beyond what UI parity needs

## Constraints

- The Web endpoint remains Electron-main-hosted remote access over LAN/VPN.
- Persistent truth remains local Postgres coordinated by the Electron main process.
- Remote Web must not write directly to the database.
- Existing `application/*`, HTTP routes, and `@suhui/store/runtime` work from the full Web client build should be preserved unless a narrow UI integration fix requires adjustment.
- Browser-appropriate degradation is allowed:
  - browser download may replace native save dialog
  - native folder picker remains hidden
  - command palette and desktop shortcuts are not acceptance requirements
  - settings expose Web-safe groups only
  - toolbar/action menus may replace context menus where direct reuse is too costly
- Mobile responsiveness is desirable, but mobile screenshot parity is not a first-pass hard gate.

## Success Criteria

- First screen is a desktop-like three-pane reader: subscription/category column, entry list, reading pane.
- Visual language matches the desktop app closely enough that the Web endpoint no longer reads as a separate rough admin panel.
- Existing desktop design tokens/component style are used or mirrored: typography, spacing, borders, hover, selected, empty, loading, and error states.
- No raw full-screen management form panels remain in the main flow.
- Subscription management, batch management, settings/RSSHub, import/export, refresh, and PDF export are accessible without polluting the main reading layout.
- Entry list, reading content, toolbar/actions, connection state, refresh state, empty states, and error states look production-quality and consistent with desktop.
- Verification includes at least one desktop/wide-browser screenshot. The screenshot must show no obvious overlap, overflow, blank primary canvas, or temporary-form appearance.
- Existing targeted runtime/service tests continue to pass where affected.
- Renderer typecheck and renderer build should pass, subject to existing repository-level blockers already documented outside this UI task.

## Pressure-pass Findings

The user initially said “和桌面端一致的 UI.” This was pressure-tested against browser limitations. The resolved interpretation is:

- Required: desktop-like visual and reading-workflow parity.
- Not required: 1:1 replication of every Electron-native interaction.

This permits controlled browser degradation while still rejecting a rough standalone remote UI.

## Brownfield Evidence

Evidence from repo inspection:

- Current remote UI is hand-built in `apps/desktop/layer/renderer/src/remote/remote-app.tsx` with custom header, view pills, full-screen management panels, and raw form controls.
- Desktop UI has established surfaces in `modules/app-layout`, `modules/subscription-column`, `modules/entry-column`, `modules/entry-content`, and `modules/settings`.
- The prior full Web client build added main-process application services, HTTP routes, and `@suhui/store/runtime`, so this task should focus on UI parity rather than backend capability expansion.

Inference:

- The fastest acceptable route is strong visual/structural parity using existing desktop patterns, not full route/component isomorphism with every desktop module.
- Directly mounting the full desktop router may create unnecessary Electron-only compatibility work for this pass.

## Design Direction

Recommended approach: strong parity without full Electron isomorphism.

- Replace the current rough remote first screen with a desktop-style reader shell.
- Use the existing remote runtime client and store hydration.
- Mirror desktop component anatomy and styling for subscription list, entry list, and reading content.
- Put management workflows behind desktop-style modal/drawer surfaces.
- Keep remote-only connection state visible but styled as a product surface, not a debug banner.

Rejected approach for this pass:

- Keeping the current standalone remote UI and only polishing colors.
- Rebuilding a generic admin dashboard.
- Fully mounting the entire desktop app/router before proving browser compatibility.

## Residual Risks

- Some desktop components may assume Electron APIs or desktop routing. If direct reuse becomes expensive, Web-safe mirrored components are acceptable.
- The desktop app’s current component boundaries may not expose all needed pieces cleanly; limited extraction may be required.
- Wide-browser screenshot is a hard gate; mobile behavior may still need a later pass.

## Handoff Recommendation

Recommended next step:

```text
$plan --direct .loopx/specs/clarify-web-ui-parity-20260508211654.md
```
