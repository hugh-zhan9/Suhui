# Suhui CLI

Repo-local command line client for agents that need to read or update Suhui RSS
state through a running Suhui Desktop remote server.

The CLI is only an HTTP client for the Desktop remote API. It does not start
Electron, and it does not read Postgres directly. Start Suhui Desktop separately
before running commands that need live data.

## Connection

By default, the CLI connects to:

```sh
http://127.0.0.1:41595
```

Override the remote server origin with `--base-url` or `SUHUI_CLI_BASE_URL`.
The command line option has priority over the environment variable.

```sh
pnpm --filter @suhui/cli dev -- --base-url http://192.168.1.20:41595 feeds list

SUHUI_CLI_BASE_URL=http://192.168.1.20:41595 \
  pnpm --filter @suhui/cli dev -- feeds list
```

The base URL must be an HTTP(S) origin only, without an API path, query, or hash.

## Output

Markdown is the default output format. Use `--format json` when a script or agent
needs structured output.

```sh
pnpm --filter @suhui/cli dev -- entries list
pnpm --filter @suhui/cli dev -- --format json entries list
```

Normal output is written to stdout. Errors are written to stderr.

## Commands

### List Entries

```sh
pnpm --filter @suhui/cli dev -- entries list
```

Useful options:

```sh
pnpm --filter @suhui/cli dev -- entries list --limit 10
pnpm --filter @suhui/cli dev -- entries list --unread
pnpm --filter @suhui/cli dev -- entries list --read
pnpm --filter @suhui/cli dev -- entries list --feed feed_123
pnpm --filter @suhui/cli dev -- entries list --with-summary
pnpm --filter @suhui/cli dev -- entries list --cursor '<next-cursor>'
pnpm --filter @suhui/cli dev -- --format json entries list --limit 10 --unread
```

`--limit` defaults to the server default and is capped by the agent API. Use the
`Next cursor` value from Markdown output, or `page.nextCursor` from JSON output,
to request the next page.

### Get Entry

```sh
pnpm --filter @suhui/cli dev -- entries get entry_123
pnpm --filter @suhui/cli dev -- entries get entry_123 --content metadata
pnpm --filter @suhui/cli dev -- entries get entry_123 --content summary
pnpm --filter @suhui/cli dev -- entries get entry_123 --max-chars 4000
pnpm --filter @suhui/cli dev -- --format json entries get entry_123
```

Markdown detail output converts the remote HTML content into readable Markdown.
`--content` accepts `full`, `summary`, or `metadata`.

### List Feeds

```sh
pnpm --filter @suhui/cli dev -- feeds list
pnpm --filter @suhui/cli dev -- --format json feeds list
```

Feed output includes feed IDs, titles, URLs, categories, and unread counts as
reported by the running Desktop remote server.

### Mark Entries Read Or Unread

```sh
pnpm --filter @suhui/cli dev -- entries mark-read entry_123 entry_456
pnpm --filter @suhui/cli dev -- entries mark-unread entry_123
pnpm --filter @suhui/cli dev -- --format json entries mark-read entry_123
```

These commands require explicit entry IDs and send the mutation to Suhui
Desktop through the remote API.

## Exit Codes

| Code | Meaning                                     |
| ---: | ------------------------------------------- |
|    0 | Success                                     |
|    1 | Parameter error or ordinary execution error |
|    2 | Remote server unavailable                   |
|    3 | Entry not found                             |
|    4 | Unexpected remote response shape            |

When Suhui Desktop remote server is not running, a smoke check should return
exit code `2` and print a connection error:

```sh
pnpm --filter @suhui/cli dev -- feeds list
echo $?
```
