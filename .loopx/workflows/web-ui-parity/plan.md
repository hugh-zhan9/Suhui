---
slug: web-ui-parity
artifact: plan
status: approved
plan_current_iteration: 1
plan_consensus_mode: true
critic_verdict: approve
---

# Plan: Web UI Parity

## RALPLAN-DR Summary

### Principles

1. Preserve the Desktop-hosted remote architecture; this is UI parity for the browser endpoint, not a new Web product.
2. Treat desktop visual structure as the north star: three-pane reader, dense lists, restrained controls, and polished modal/drawer management surfaces.
3. Reuse existing runtime/application-service contracts; avoid backend rewrites unless a narrow missing UI operation is discovered.
4. Prefer Web-safe mirrored components over risky full desktop-router mounting when desktop components pull Electron-only or non-goal features.
5. Require screenshot evidence before accepting the build, because the failure mode is visual quality, not only functional correctness.

### Decision Drivers

1. The user explicitly rejected a rough UI and asked for desktop consistency.
2. The current remote UI is functional but hand-built and visually separate from the desktop product.
3. Direct full-desktop reuse risks pulling non-goal Electron/router/command/media surfaces into the browser endpoint.

### Viable Options

#### Option A: Mount The Full Desktop Router In Remote

Pros:

- Highest theoretical component parity.
- Could reuse desktop entry, subscription, and settings surfaces with fewer visual reinterpretations.

Cons:

- High compatibility risk from router assumptions, command bindings, Electron conditionals, player/update modules, and desktop-only settings.
- Likely expands scope into non-goals such as command palette/shortcut parity and desktop integration cleanup.
- Verification cost is high before the UI can be trusted in a browser.

#### Option B: Polish Current Remote UI In Place

Pros:

- Lowest code movement.
- Preserves current functional behavior.

Cons:

- Fails the user's clarified intent because the structure remains a standalone admin-like remote panel.
- Raw full-screen management forms would likely persist.
- Screenshot gate would still reject the first impression.

#### Option C: Remote-Specific Desktop-Parity Shell

Pros:

- Keeps existing remote runtime and HTTP contracts.
- Delivers the required three-pane reader and desktop-like visual system without dragging in desktop-only surfaces.
- Allows selective extraction of safe desktop primitives and component anatomy.
- Keeps management features available but moves them into product-style drawers/modals.

Cons:

- Requires some mirrored UI code, so parity must be maintained deliberately.
- Some desktop components may still need small extraction or style harmonization later.

### Decision

Choose Option C: build a remote-specific desktop-parity shell.

## Plan Package

### PRD Translation

The remote Web endpoint must open directly into a polished three-pane reader:

- subscription/category rail on the left
- entry list in the middle
- reading pane on the right

The following workflows remain available:

- reading entries and details
- read/unread
- refresh current feed and all feeds
- add/edit/delete subscriptions
- batch subscription management
- settings page surface for Web-safe settings
- RSSHub configuration
- import/export
- PDF export

Management workflows must not occupy the primary reader layout as raw panels. They should be opened from reader actions into modal/drawer surfaces.

### Architecture Approach

- Keep `remote.html`, `remote/main.tsx`, remote HTTP server, and runtime clients.
- Replace the current `remote-app.tsx` monolith with a shell plus components under `src/remote/components`.
- Mirror desktop UI anatomy:
  - remote subscription rail modeled after desktop subscription column density and tab/view grouping
  - remote entry list modeled after desktop entry column item rhythm
  - remote reading pane modeled after desktop entry content title/meta/action/content hierarchy
  - remote settings/management surfaces modeled after desktop modal/sidebar settings layout
- Continue using `runtimeClient`, `remoteSSEHandler`, and store hooks.
- Hide scoped-out desktop-native settings and controls.

### Development Plan

1. Baseline and visual inventory.
2. Split remote shell into focused components.
3. Implement three-pane desktop-like reader layout.
4. Move subscription and batch management into a desktop-style drawer.
5. Move settings/RSSHub/import/export into a desktop-style modal or drawer.
6. Polish reading pane actions, connection state, refresh state, empty/loading/error states, and PDF export.
7. Add focused tests for selection/actions and run renderer verification.
8. Capture at least one wide-browser screenshot and evaluate it against the visual acceptance gate.

### Test Plan

- Run focused remote tests for navigation and action behavior.
- Add/adjust component or state tests around:
  - selecting feeds and entries
  - read/unread actions
  - refresh actions
  - drawer/modal visibility
  - import/export/RSSHub/PDF action wiring where practical
- Run renderer typecheck.
- Run renderer build.
- Use browser screenshot verification on a desktop/wide viewport.

### Acceptance Criteria

- First screen is a desktop-like three-pane reader.
- The UI no longer reads as a rough admin/visualization panel.
- No raw full-screen management form panels remain in the main flow.
- Subscription, batch management, settings/RSSHub, import/export, refresh, and PDF export are accessible.
- Browser-safe degradation is respected.
- Wide-browser screenshot shows no obvious overlap, overflow, blank primary canvas, or temporary-form appearance.
- Targeted tests and renderer verification pass, except known unrelated project-level blockers.

### Risk Register

| Risk                                                            | Impact                                   | Mitigation                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Direct desktop component reuse pulls Electron-only dependencies | Browser breakage or scope expansion      | Use Web-safe mirrored components first; extract only stable primitives                                |
| Mirrored UI drifts from desktop style                           | User still sees a separate rough Web app | Use desktop dimensions, tokens, density, and component hierarchy as explicit acceptance gates         |
| Remote management workflows remain visually raw                 | Fails core request                       | Require modal/drawer redesign before screenshot acceptance                                            |
| Runtime client lacks a small needed operation                   | UI cannot complete a workflow            | Add narrow runtime method backed by existing application service; do not rewrite service architecture |
| Visual screenshot tooling is unavailable                        | Acceptance evidence incomplete           | Use Playwright or Browser Use; document blocker if local browser cannot start                         |

## Consensus Review

### Planner Draft

The planner recommends a remote-specific desktop-parity shell. This is the smallest plan that satisfies the user's visual parity request while preserving the Desktop-hosted remote model and already-built service/runtime foundation.

### Architect Review

Strongest objection: a mirrored remote shell may create a second UI implementation that can drift from the desktop app.

Tradeoff tension: full desktop reuse maximizes parity but risks non-goal Electron/router coupling; remote-specific mirroring reduces compatibility risk but requires discipline to keep the visual language aligned.

Mitigations:

- Mirror desktop layout anatomy and tokens explicitly.
- Extract safe desktop primitives only when they are genuinely browser-safe.
- Add screenshot-based acceptance so visual drift is caught immediately.
- Keep backend/runtime untouched unless a missing operation is proven.

Architect status: complete. The objection is valid but does not overturn the recommended option because the first-pass goal is reliable browser UI parity, not architectural isomorphism.

### Critic Gate

Verdict: APPROVE.

Reasoning:

- Alternatives are fairly compared.
- The chosen option matches all clarified non-goals and decision boundaries.
- Acceptance criteria are testable.
- Verification includes screenshot evidence, not just type/build checks.
- Execution inputs are mapped to concrete files and services.

## Execution Bridge

Recommended lane: `build`.

Recommended next command:

```text
$build --direct .loopx/workflows/web-ui-parity/development-plan.md
```
