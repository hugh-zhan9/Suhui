# DB Switch + Disable Global AI Chat Command - Design

Date: 2026-03-10

## Background

The desktop app currently uses SQLite only. The user wants optional PostgreSQL support via configuration (no UI) and to fully disable the global AI chat command/hotkey.

## Goals

- Support switching database backend using environment variables.
- Allow user override via `userData/.env`.
- Keep SQLite as default when `DB_TYPE` not set.
- Add PostgreSQL support without UI changes.
- Disable the global AI chat command and hotkey (not just hide).

## Non-Goals

- Multi-user database sharing.
- Cloud-hosted database managed by us.
- Automatic fallback to SQLite on Postgres failure.
- UI for database configuration.

## Configuration

Environment variables (read at startup):

- `DB_TYPE`: `sqlite` | `postgres`
- `DB_CONN`: `host:port/dbname` OR full DSN if contains `://`
- `DB_USER`
- `DB_PASSWORD`

Precedence:

1. `userData/.env` (override)
2. App-bundled `.env` (optional)
3. `process.env`

## Database Selection

- On startup, load env, then `DBManager.init()` chooses backend.
- SQLite: use existing `better-sqlite3` path and migrations.
- Postgres: parse `DB_CONN`, establish connection using `pg`, initialize drizzle, run migrations.

### DB_CONN Parsing

- If `DB_CONN` includes `://`, treat as DSN and pass through.
- Otherwise parse as `host:port/dbname` and assemble connection config.

## Error Handling

- If Postgres initialization fails, show error and exit app (no fallback).

## Command/Hotkey Disablement

- Remove registration of `toggleAIChat` from global commands list.
- Remove default shortcut binding for `toggleAIChat`.
- Remove hotkey listener registration in main view hotkeys provider.

## Testing Strategy

- Unit tests for `DB_CONN` parsing for both formats.
- Unit tests for backend selection logic.
- Ensure existing SQLite flow unaffected when no Postgres config.

## Rollout Notes

- Document env variables for users.
- `userData/.env` allows local overrides after packaging.
