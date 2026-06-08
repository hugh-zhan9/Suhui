---
slug: web-ui-parity
artifact: prd
status: approved
---

# PRD: Web UI Parity

## Problem

The current Desktop-hosted remote Web endpoint is functionally useful but looks and behaves like a rough standalone management surface. The user needs a complete Web endpoint whose UI is consistent with the desktop reader experience.

## Goal

Make the browser endpoint feel like the desktop RSS reader for daily reading and Web-safe management workflows.

## Users

- Existing desktop user opening Suhui over LAN/VPN in a browser.
- Same user expects their local desktop app to remain the owner of data and services.

## Requirements

### Reader First Screen

- Show a three-pane reader on desktop/wide screens:
  - subscription/category rail
  - entry list
  - reading pane
- Use desktop-like density, borders, typography, hover states, selected states, and empty/loading/error states.
- Keep current reading workflows:
  - list entries
  - open detail
  - mark read/unread
  - unread-only filter
  - refresh current/all
  - open original
  - export PDF

### Subscription Management

- Add subscription.
- Preview subscription.
- Edit title/category/view.
- Delete subscription.
- Multi-select subscriptions.
- Batch update category/view.
- Batch delete.
- Refresh selected/all.
- Surface these in a drawer/modal, not the main reader canvas.

### Settings / RSSHub / Import Export

- Provide Web-safe settings surface.
- Support RSSHub custom URL and precheck.
- Support import/export.
- Hide unsupported native desktop settings.

### PDF Export

- Support browser PDF export from the entry toolbar.
- Use browser download behavior.
- Show busy/error state.

## Non-goals

- New Web/server app.
- Direct browser DB writes.
- Auth model change.
- Window controls, tray, dock badge, startup controls.
- System notifications, system fonts, native folder picker, system proxy.
- Electron menu, command palette, shortcut parity.
- AI/translation/summary online surfaces.
- Player/corner media window.

## Success Metrics

- Wide-browser screenshot passes the visual gate.
- First screen reads as a desktop-style RSS reader.
- No raw management forms are present in the primary flow.
- Existing remote workflows remain accessible.
- Renderer typecheck and renderer build pass.
