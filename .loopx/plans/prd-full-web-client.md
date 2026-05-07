---
slug: full-web-client
artifact: prd
status: approved
source_requirements: .loopx/specs/clarify-full-web-client-20260507224057.md
---

# PRD: Full Web Client

## Problem

Suhui currently has a Desktop app and a lightweight browser remote entry. The remote entry supports reading and light subscription management, but it is not a complete Web client. Important workflows such as settings, import/export, batch subscription management, RSSHub configuration, and PDF export are absent or desktop-only.

## Goal

Provide a complete browser-accessible Web endpoint served by the running Desktop app over `IP + port`.

The Web endpoint must be a first-class client over Electron main application services, while local Postgres remains the source of truth.

## Users

- Primary: the local Desktop user accessing Suhui from another browser on the same LAN/VPN.
- Secondary: the same user switching between Desktop renderer and remote browser.

## Scope

First version includes:

- reading
- subscription create/update/delete
- batch subscription management
- refresh
- unread/read state
- settings pages
- import/export
- RSSHub configuration
- PDF export

## Non-Goals

- independent cloud/server product
- authentication, access code, roles, permissions, read-only mode
- replacing local Postgres
- tray behavior
- open-at-login controls
- system font enumeration
- Dock badge
- system notifications
- Eagle/Obsidian/qBittorrent integrations
- native folder picker
- system-level proxy switching

## Product Requirements

### Reading

- The Web endpoint shows subscriptions, unread counts, entry lists, and entry details.
- It supports feed/timeline navigation expected from the current reader.
- It shows disconnected state when realtime connection fails.

### Subscription Management

- User can add RSS/RSSHub subscriptions.
- User can edit title, category, and view.
- User can delete subscriptions.
- User can batch move/category/delete subscriptions.

### Refresh

- User can refresh a single feed.
- User can refresh all feeds.
- UI updates after refresh via events/refetch.

### Read State

- User can mark entries read/unread.
- User can perform supported batch read/unread operations exposed in Web UI.
- Desktop and Web stay consistent.

### Settings

- Web shows settings that are supported in the remote browser runtime.
- Web hides or degrades desktop/system-only settings.

### Import/Export

- Web can export supported app data through browser download.
- Web can import supported app data through browser upload.
- Invalid import payloads fail clearly.

### RSSHub Configuration

- Web can view and update external RSSHub custom URL.
- Web can recover from unconfigured RSSHub state.

### PDF Export

- Web can export an article as PDF through browser download.
- Desktop can retain native save dialog behavior.

## Security Requirement

First version intentionally has no authentication or permission model. Any browser that reaches the remote endpoint has full permissions.

## Success Metrics

- All first-version workflows pass manual acceptance.
- IPC and HTTP routes share application services for overlapping operations.
- No regression in existing Desktop RSS reading/refresh/read-state behavior.
- Web runtime does not show non-goal desktop/system controls.

## Release Criteria

- Plan test suite passes.
- Remote endpoint can be started from Desktop dev flow.
- Web and Desktop mutations remain synchronized.
- Residual no-auth risk is documented.
