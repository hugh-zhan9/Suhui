# Suhui Agent CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** `docs/loopx/design/Suhui Agent CLI需求设计文档.md`

**Goal:** Build a repo-local `suhui` CLI for agents to read Suhui entries/feed lists through a new stable `/api/agent/*` remote API, with Markdown as the default output and JSON as an explicit option.

**Architecture:** Suhui Desktop remains the only process that reads/writes the local database. The new main-process `AgentApplicationService` exposes stable agent schemas and is wired into the existing remote HTTP server under `/api/agent/*`; the new `apps/cli` package is a Node client that calls those endpoints, formats Markdown/JSON, and exits with stable codes.

**Tech Stack:** TypeScript ESM, Electron main remote HTTP server, Drizzle query APIs, Vitest, pnpm workspace, Node `fetch`.

---

## Current Implementation Snapshot

**Updated:** 2026-06-05 15:18 CST

**Status:** implemented and reviewed.

Completed scope:

- Added `AgentApplicationService` and `/api/agent/*` remote routes for entries list, entry detail, feeds list, and explicit read-status updates.
- Added repo-local `apps/cli` package with `suhui` bin, Markdown default output, JSON output, base URL override, stable error codes, and runtime response-shape validation.
- Hardened agent list pagination so active-visibility filtering does not lose later visible rows.
- Hardened read-status payload validation with boolean `read`, string-array `entryIds`, a 500-ID cap, and malformed JSON handling.
- Kept CLI as an HTTP client only; it does not access Postgres or start Electron.

Verification status:

- PASS: `pnpm --filter @suhui/electron-main test -- src/application/agent/service.test.ts src/remote/manager.test.ts` (`48` files, `197` tests).
- PASS: `pnpm --filter @suhui/cli test` (`5` files, `45` tests).
- PASS: `pnpm --filter @suhui/cli typecheck`.
- PASS: `pnpm --filter @suhui/cli build`.
- PASS: remote-unavailable smoke via `pnpm --filter @suhui/cli dev -- feeds list` returned exit code `2` and `SUHUI_REMOTE_UNAVAILABLE`.
- BLOCKED BY EXISTING BASELINE: `pnpm --filter @suhui/electron-main typecheck` still fails on historical rootDir/file-list and old test typing issues; the new `src/application/agent/service.test.ts` type error found during this session was fixed.

Review status:

- CLI malformed-response fix: spec review approved; code quality review approved.
- Desktop main Agent API fix: spec review approved; code quality re-review approved after follow-up fixes.

---

## File Structure

Create or modify these files only:

- Create `apps/desktop/layer/main/src/application/agent/types.ts`
  - Owns agent API request/response types, error class, constants, and shared helpers.
- Create `apps/desktop/layer/main/src/application/agent/cursor.ts`
  - Encodes/decodes stable opaque cursors using `publishedAt`, `insertedAt`, and `id`.
- Create `apps/desktop/layer/main/src/application/agent/service.ts`
  - Owns article list/detail/feed aggregation and explicit read-status mutation.
- Create `apps/desktop/layer/main/src/application/agent/service.test.ts`
  - Focused tests for cursor/filter/content-source/feed-title/unread aggregation.
- Modify `apps/desktop/layer/main/src/remote/manager.ts`
  - Adds dependency injection slots and routes for `/api/agent/*`.
- Modify `apps/desktop/layer/main/src/remote/manager.test.ts`
  - Adds route tests using injected providers.
- Modify `pnpm-workspace.yaml`
  - Adds `apps/cli` to the workspace.
- Create `apps/cli/package.json`
  - Defines package `@suhui/cli`, bin `suhui`, scripts.
- Create `apps/cli/tsconfig.json`
  - CLI TypeScript config.
- Create `apps/cli/vitest.config.ts`
  - CLI Vitest config.
- Create `apps/cli/src/types.ts`
  - CLI-side API schema and exit/error types.
- Create `apps/cli/src/config.ts`
  - Base URL and option parsing helpers.
- Create `apps/cli/src/http.ts`
  - Fetch wrapper with timeout, response validation, and API error mapping.
- Create `apps/cli/src/format.ts`
  - Markdown/JSON formatters plus lightweight HTML-to-Markdown conversion and truncation.
- Create `apps/cli/src/args.ts`
  - Minimal command parser for the approved CLI contract.
- Create `apps/cli/src/run.ts`
  - Testable `runCli()` orchestration.
- Create `apps/cli/src/index.ts`
  - Shebang process entrypoint.
- Create `apps/cli/src/*.test.ts`
  - Focused tests for args, formatters, and runner behavior.
- Create `apps/cli/README.md`
  - Usage notes for repo-local CLI.

Do not add database migrations, renderer changes, refresh commands, subscription mutation commands, auth/token behavior, or installer/PATH integration.

## Implementation Rules

- Keep all new agent API response schemas independent of DB raw rows.
- `entries list` must apply `limit`, `cursor`, `feedId`, and `read` on the service side before returning to CLI.
- `limit` defaults to `20`; clamp valid numeric values into `1..100`.
- Cursor must be opaque to CLI and stable across equal `publishedAt` values.
- CLI default format is `markdown`; JSON requires `--format json`.
- CLI base URL priority is `--base-url` > `SUHUI_CLI_BASE_URL` > `http://127.0.0.1:41595`.
- CLI writes normal output to stdout, errors to stderr, and returns stable exit codes:
  - `0`: success
  - `1`: parameter or ordinary execution error
  - `2`: remote unavailable
  - `3`: not found
  - `4`: unexpected response

---

### Task 1: Add Agent Service Contracts And Cursor Utilities

**Files:**

- Create: `apps/desktop/layer/main/src/application/agent/types.ts`
- Create: `apps/desktop/layer/main/src/application/agent/cursor.ts`
- Test: `apps/desktop/layer/main/src/application/agent/service.test.ts`

- [ ] **Step 1: Write failing cursor and content-source tests**

Create `apps/desktop/layer/main/src/application/agent/service.test.ts` with these initial tests:

```ts
import { describe, expect, it } from "vitest"

import { decodeAgentEntriesCursor, encodeAgentEntriesCursor, isEntryAfterCursor } from "./cursor"
import { selectAgentEntryContent } from "./types"

describe("agent cursor", () => {
  it("round-trips an opaque cursor", () => {
    const cursor = encodeAgentEntriesCursor({
      publishedAt: 1710000000000,
      insertedAt: 1710000001000,
      id: "entry-b",
    })

    expect(cursor).not.toContain("entry-b")
    expect(decodeAgentEntriesCursor(cursor)).toEqual({
      publishedAt: 1710000000000,
      insertedAt: 1710000001000,
      id: "entry-b",
    })
  })

  it("orders entries after a cursor using publishedAt, insertedAt, then id", () => {
    const cursor = { publishedAt: 1000, insertedAt: 900, id: "entry-b" }

    expect(isEntryAfterCursor({ publishedAt: 999, insertedAt: 999, id: "entry-z" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 899, id: "entry-z" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 900, id: "entry-a" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 900, id: "entry-c" }, cursor)).toBe(
      false,
    )
  })
})

describe("selectAgentEntryContent", () => {
  it("prefers readabilityContent, then content, then description", () => {
    expect(
      selectAgentEntryContent({
        readabilityContent: "<article>Readable</article>",
        content: "<p>Raw</p>",
        description: "Summary",
      }),
    ).toEqual({ content: "<article>Readable</article>", contentSource: "readabilityContent" })

    expect(
      selectAgentEntryContent({
        readabilityContent: "",
        content: "<p>Raw</p>",
        description: "Summary",
      }),
    ).toEqual({ content: "<p>Raw</p>", contentSource: "content" })

    expect(
      selectAgentEntryContent({
        readabilityContent: null,
        content: " ",
        description: "Summary",
      }),
    ).toEqual({ content: "Summary", contentSource: "description" })
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @suhui/electron-main test -- src/application/agent/service.test.ts
```

Expected: FAIL because `./cursor` and `./types` do not exist.

- [ ] **Step 3: Add `types.ts`**

Create `apps/desktop/layer/main/src/application/agent/types.ts`:

```ts
export const agentEntriesDefaultLimit = 20
export const agentEntriesMaxLimit = 100

export type AgentFormatTimestamp = number | null

export type AgentEntryContentSource = "readabilityContent" | "content" | "description" | "none"

export type AgentEntriesCursor = {
  publishedAt: number
  insertedAt: number
  id: string
}

export type AgentEntriesListOptions = {
  feedId?: string
  read?: boolean
  limit?: number
  cursor?: string
  withSummary?: boolean
}

export type AgentEntryListItem = {
  id: string
  feedId: string | null
  feedTitle: string
  title: string
  url: string | null
  author: string | null
  publishedAt: AgentFormatTimestamp
  publishedAtIso: string | null
  insertedAt: AgentFormatTimestamp
  insertedAtIso: string | null
  read: boolean
  summary?: string | null
}

export type AgentEntriesListResult = {
  items: AgentEntryListItem[]
  page: {
    limit: number
    nextCursor: string | null
    hasMore: boolean
  }
}

export type AgentEntryDetail = AgentEntryListItem & {
  content: string
  contentSource: AgentEntryContentSource
  description: string | null
}

export type AgentFeedListItem = {
  id: string
  subscriptionId: string
  title: string
  url: string | null
  siteUrl: string | null
  category: string | null
  unreadCount: number
}

export type AgentFeedsListResult = {
  items: AgentFeedListItem[]
}

export type AgentReadStatusResult = {
  updated: number
  read: boolean
}

export type AgentErrorCode =
  | "SUHUI_INVALID_LIMIT"
  | "SUHUI_INVALID_CURSOR"
  | "SUHUI_ENTRY_NOT_FOUND"
  | "SUHUI_INVALID_ENTRY_IDS"
  | "SUHUI_AGENT_INTERNAL_ERROR"

export class AgentApplicationError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = "AgentApplicationError"
  }
}

export const toIsoString = (value: unknown): string | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return new Date(value).toISOString()
}

export const normalizeLimit = (value: unknown): number => {
  if (value === undefined || value === null || value === "") return agentEntriesDefaultLimit
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new AgentApplicationError("SUHUI_INVALID_LIMIT", "limit must be a number", 400)
  }
  return Math.max(1, Math.min(agentEntriesMaxLimit, Math.trunc(parsed)))
}

export const selectAgentEntryContent = (entry: {
  readabilityContent?: string | null
  content?: string | null
  description?: string | null
}): { content: string; contentSource: AgentEntryContentSource } => {
  const readabilityContent = entry.readabilityContent?.trim()
  if (readabilityContent) {
    return { content: entry.readabilityContent!, contentSource: "readabilityContent" }
  }

  const content = entry.content?.trim()
  if (content) {
    return { content: entry.content!, contentSource: "content" }
  }

  const description = entry.description?.trim()
  if (description) {
    return { content: entry.description!, contentSource: "description" }
  }

  return { content: "", contentSource: "none" }
}
```

- [ ] **Step 4: Add `cursor.ts`**

Create `apps/desktop/layer/main/src/application/agent/cursor.ts`:

```ts
import { AgentApplicationError, type AgentEntriesCursor } from "./types"

const isCursor = (value: unknown): value is AgentEntriesCursor => {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<AgentEntriesCursor>
  return (
    typeof candidate.publishedAt === "number" &&
    Number.isFinite(candidate.publishedAt) &&
    typeof candidate.insertedAt === "number" &&
    Number.isFinite(candidate.insertedAt) &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0
  )
}

export const encodeAgentEntriesCursor = (cursor: AgentEntriesCursor): string => {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

export const decodeAgentEntriesCursor = (cursor: string): AgentEntriesCursor => {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown
    if (isCursor(decoded)) return decoded
  } catch {}

  throw new AgentApplicationError("SUHUI_INVALID_CURSOR", "cursor is invalid", 400)
}

export const isEntryAfterCursor = (
  entry: AgentEntriesCursor,
  cursor: AgentEntriesCursor,
): boolean => {
  if (entry.publishedAt !== cursor.publishedAt) return entry.publishedAt < cursor.publishedAt
  if (entry.insertedAt !== cursor.insertedAt) return entry.insertedAt < cursor.insertedAt
  return entry.id < cursor.id
}
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
pnpm --filter @suhui/electron-main test -- src/application/agent/service.test.ts
```

Expected: PASS for cursor and content-source tests.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/layer/main/src/application/agent/types.ts \
  apps/desktop/layer/main/src/application/agent/cursor.ts \
  apps/desktop/layer/main/src/application/agent/service.test.ts
git commit -m "feat: add agent api contracts"
```

---

### Task 2: Implement Agent Application Service

**Files:**

- Modify: `apps/desktop/layer/main/src/application/agent/service.test.ts`
- Create: `apps/desktop/layer/main/src/application/agent/service.ts`

- [ ] **Step 1: Extend service tests with DB/service mocks**

Replace `apps/desktop/layer/main/src/application/agent/service.test.ts` with this complete file:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@suhui/database/services/entry", () => ({
  EntryService: {
    patchMany: vi.fn(),
  },
}))

vi.mock("@suhui/database/services/feed", () => ({
  FeedService: {
    getFeedAll: vi.fn(),
  },
}))

vi.mock("@suhui/database/services/subscription", () => ({
  SubscriptionService: {
    getSubscriptionAll: vi.fn(),
  },
}))

vi.mock("@suhui/database/services/internal/active-visibility", () => ({
  getActiveVisibilityState: vi.fn().mockResolvedValue({
    activeFeedIds: new Set(["feed-1", "feed-2"]),
    activeInboxIds: new Set<string>(),
    activeListIds: new Set<string>(),
  }),
  isEntryVisibleForActiveRelations: vi.fn((entry) => !entry.hidden),
}))

vi.mock("~/manager/db", () => ({
  DBManager: {
    getDB: vi.fn(),
  },
}))

vi.mock("~/application/unread/service", () => ({
  unreadApplicationService: {
    listUnreadCounts: vi.fn(),
  },
}))

vi.mock("~/manager/sync-logger", () => ({
  syncLogger: {
    record: vi.fn(),
  },
}))

import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"

import { unreadApplicationService } from "~/application/unread/service"
import { DBManager } from "~/manager/db"

import { decodeAgentEntriesCursor, encodeAgentEntriesCursor, isEntryAfterCursor } from "./cursor"
import { agentApplicationService } from "./service"
import { selectAgentEntryContent } from "./types"

const entryRows = [
  {
    id: "entry-3",
    feedId: "feed-2",
    title: "Third",
    url: "https://example.com/3",
    author: null,
    publishedAt: 3000,
    insertedAt: 300,
    read: true,
    description: "Third summary",
    content: "<p>Third body</p>",
    readabilityContent: null,
  },
  {
    id: "entry-2",
    feedId: "feed-1",
    title: "Second",
    url: "https://example.com/2",
    author: "Ann",
    publishedAt: 2000,
    insertedAt: 200,
    read: false,
    description: "Second summary",
    content: "<p>Second body</p>",
    readabilityContent: "<article>Second readable</article>",
  },
  {
    id: "entry-1",
    feedId: "feed-1",
    title: null,
    url: "https://example.com/1",
    author: null,
    publishedAt: 1000,
    insertedAt: 100,
    read: false,
    description: "First summary",
    content: "<p>First body</p>",
    readabilityContent: null,
  },
]

const createDb = () => ({
  query: {
    entriesTable: {
      findMany: vi.fn(async ({ limit }: { limit?: number } = {}) => entryRows.slice(0, limit)),
      findFirst: vi.fn(async () => entryRows[1]),
    },
  },
})

describe("agent cursor", () => {
  it("round-trips an opaque cursor", () => {
    const cursor = encodeAgentEntriesCursor({
      publishedAt: 1710000000000,
      insertedAt: 1710000001000,
      id: "entry-b",
    })

    expect(cursor).not.toContain("entry-b")
    expect(decodeAgentEntriesCursor(cursor)).toEqual({
      publishedAt: 1710000000000,
      insertedAt: 1710000001000,
      id: "entry-b",
    })
  })

  it("orders entries after a cursor using publishedAt, insertedAt, then id", () => {
    const cursor = { publishedAt: 1000, insertedAt: 900, id: "entry-b" }

    expect(isEntryAfterCursor({ publishedAt: 999, insertedAt: 999, id: "entry-z" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 899, id: "entry-z" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 900, id: "entry-a" }, cursor)).toBe(
      true,
    )
    expect(isEntryAfterCursor({ publishedAt: 1000, insertedAt: 900, id: "entry-c" }, cursor)).toBe(
      false,
    )
  })
})

describe("selectAgentEntryContent", () => {
  it("prefers readabilityContent, then content, then description", () => {
    expect(
      selectAgentEntryContent({
        readabilityContent: "<article>Readable</article>",
        content: "<p>Raw</p>",
        description: "Summary",
      }),
    ).toEqual({ content: "<article>Readable</article>", contentSource: "readabilityContent" })

    expect(
      selectAgentEntryContent({
        readabilityContent: "",
        content: "<p>Raw</p>",
        description: "Summary",
      }),
    ).toEqual({ content: "<p>Raw</p>", contentSource: "content" })

    expect(
      selectAgentEntryContent({
        readabilityContent: null,
        content: " ",
        description: "Summary",
      }),
    ).toEqual({ content: "Summary", contentSource: "description" })
  })
})

describe("AgentApplicationService", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(DBManager.getDB).mockReturnValue(createDb() as any)
    vi.mocked(FeedService.getFeedAll).mockResolvedValue([
      {
        id: "feed-1",
        title: "Feed One",
        url: "https://example.com/rss.xml",
        siteUrl: "https://example.com",
      },
      {
        id: "feed-2",
        title: "Feed Two",
        url: "https://two.example/rss.xml",
        siteUrl: "https://two.example",
      },
    ] as any)
    vi.mocked(SubscriptionService.getSubscriptionAll).mockResolvedValue([
      {
        id: "feed/feed-1",
        type: "feed",
        feedId: "feed-1",
        title: "Custom Feed One",
        category: "Tech",
      },
      { id: "feed/feed-2", type: "feed", feedId: "feed-2", title: null, category: null },
    ] as any)
    vi.mocked(unreadApplicationService.listUnreadCounts).mockResolvedValue([
      { id: "feed-1", count: 2 },
      { id: "feed-2", count: 1 },
    ])
  })

  it("lists lightweight entries with feed title, optional summary, and cursor metadata", async () => {
    const result = await agentApplicationService.listEntries({ limit: 2, withSummary: true })

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "entry-3",
        feedId: "feed-2",
        feedTitle: "Feed Two",
        title: "Third",
        read: true,
        summary: "Third summary",
      }),
      expect.objectContaining({
        id: "entry-2",
        feedId: "feed-1",
        feedTitle: "Custom Feed One",
        title: "Second",
        read: false,
        summary: "Second summary",
      }),
    ])
    expect(result.page.limit).toBe(2)
    expect(result.page.hasMore).toBe(true)
    expect(result.page.nextCursor).toBeTruthy()
  })

  it("returns entry detail with selected content source", async () => {
    const detail = await agentApplicationService.getEntry("entry-2")

    expect(detail).toEqual(
      expect.objectContaining({
        id: "entry-2",
        feedTitle: "Custom Feed One",
        content: "<article>Second readable</article>",
        contentSource: "readabilityContent",
        description: "Second summary",
      }),
    )
  })

  it("lists feeds with unread counts", async () => {
    const result = await agentApplicationService.listFeeds()

    expect(result.items).toEqual([
      {
        id: "feed-1",
        subscriptionId: "feed/feed-1",
        title: "Custom Feed One",
        url: "https://example.com/rss.xml",
        siteUrl: "https://example.com",
        category: "Tech",
        unreadCount: 2,
      },
      {
        id: "feed-2",
        subscriptionId: "feed/feed-2",
        title: "Feed Two",
        url: "https://two.example/rss.xml",
        siteUrl: "https://two.example",
        category: null,
        unreadCount: 1,
      },
    ])
  })

  it("marks explicit entries read or unread", async () => {
    await expect(
      agentApplicationService.updateReadStatus({ entryIds: ["entry-1", "entry-2"], read: true }),
    ).resolves.toEqual({ updated: 2, read: true })

    expect(EntryService.patchMany).toHaveBeenCalledWith({
      entryIds: ["entry-1", "entry-2"],
      entry: { read: true },
    })
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @suhui/electron-main test -- src/application/agent/service.test.ts
```

Expected: FAIL because `./service` does not exist.

- [ ] **Step 3: Implement `service.ts`**

Create `apps/desktop/layer/main/src/application/agent/service.ts`:

```ts
import { and, eq, isNull, lt, or } from "drizzle-orm"

import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import {
  getActiveVisibilityState,
  isEntryVisibleForActiveRelations,
} from "@suhui/database/services/internal/active-visibility"
import { SubscriptionService } from "@suhui/database/services/subscription"

import { unreadApplicationService } from "~/application/unread/service"
import { DBManager } from "~/manager/db"

import { decodeAgentEntriesCursor, encodeAgentEntriesCursor } from "./cursor"
import {
  AgentApplicationError,
  type AgentEntriesListOptions,
  type AgentEntriesListResult,
  type AgentEntryDetail,
  type AgentEntryListItem,
  type AgentFeedListItem,
  type AgentFeedsListResult,
  type AgentReadStatusResult,
  normalizeLimit,
  selectAgentEntryContent,
  toIsoString,
} from "./types"

type EntryRow = {
  id: string
  feedId?: string | null
  title?: string | null
  url?: string | null
  author?: string | null
  publishedAt?: number | null
  insertedAt?: number | null
  read?: boolean | null
  description?: string | null
  content?: string | null
  readabilityContent?: string | null
}

type FeedRow = {
  id: string
  title?: string | null
  url?: string | null
  siteUrl?: string | null
}

type SubscriptionRow = {
  id: string
  type: "feed" | "list" | "inbox"
  feedId?: string | null
  title?: string | null
  category?: string | null
}

const safeTimestamp = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const normalizeTitle = (value: string | null | undefined, fallback = "(Untitled)") => {
  const trimmed = value?.trim()
  return trimmed || fallback
}

const buildFeedContext = async () => {
  const [feeds, subscriptions] = await Promise.all([
    FeedService.getFeedAll() as Promise<FeedRow[]>,
    SubscriptionService.getSubscriptionAll() as Promise<SubscriptionRow[]>,
  ])

  const feedById = new Map(feeds.map((feed) => [feed.id, feed]))
  const subscriptionByFeedId = new Map<string, SubscriptionRow>()
  for (const subscription of subscriptions) {
    if (subscription.type === "feed" && subscription.feedId) {
      subscriptionByFeedId.set(subscription.feedId, subscription)
    }
  }

  return { feedById, subscriptionByFeedId }
}

const getFeedTitle = (
  feedId: string | null | undefined,
  context: Awaited<ReturnType<typeof buildFeedContext>>,
) => {
  if (!feedId) return "Unknown Feed"
  const subscription = context.subscriptionByFeedId.get(feedId)
  const feed = context.feedById.get(feedId)
  return normalizeTitle(subscription?.title || feed?.title, feedId)
}

const toListItem = (
  entry: EntryRow,
  context: Awaited<ReturnType<typeof buildFeedContext>>,
  options?: { withSummary?: boolean },
): AgentEntryListItem => {
  const publishedAt = safeTimestamp(entry.publishedAt)
  const insertedAt = safeTimestamp(entry.insertedAt)
  return {
    id: entry.id,
    feedId: entry.feedId ?? null,
    feedTitle: getFeedTitle(entry.feedId, context),
    title: normalizeTitle(entry.title),
    url: entry.url ?? null,
    author: entry.author ?? null,
    publishedAt,
    publishedAtIso: toIsoString(publishedAt),
    insertedAt,
    insertedAtIso: toIsoString(insertedAt),
    read: entry.read === true,
    ...(options?.withSummary ? { summary: entry.description ?? null } : {}),
  }
}

export class AgentApplicationService {
  async listEntries(options: AgentEntriesListOptions = {}): Promise<AgentEntriesListResult> {
    const db = DBManager.getDB()
    const limit = normalizeLimit(options.limit)
    const cursor = options.cursor ? decodeAgentEntriesCursor(options.cursor) : null

    const rows = (await db.query.entriesTable.findMany({
      where: (entries: any) =>
        and(
          isNull(entries.deletedAt),
          options.feedId ? eq(entries.feedId, options.feedId) : undefined,
          typeof options.read === "boolean" ? eq(entries.read, options.read) : undefined,
          cursor
            ? or(
                lt(entries.publishedAt, cursor.publishedAt),
                and(
                  eq(entries.publishedAt, cursor.publishedAt),
                  lt(entries.insertedAt, cursor.insertedAt),
                ),
                and(
                  eq(entries.publishedAt, cursor.publishedAt),
                  eq(entries.insertedAt, cursor.insertedAt),
                  lt(entries.id, cursor.id),
                ),
              )
            : undefined,
        ),
      orderBy: (entries: any, { desc }: any) => [
        desc(entries.publishedAt),
        desc(entries.insertedAt),
        desc(entries.id),
      ],
      limit: limit + 1,
    })) as EntryRow[]

    const visibility = await getActiveVisibilityState()
    const visibleRows = rows.filter((entry) =>
      isEntryVisibleForActiveRelations(entry as any, visibility),
    )
    const pageRows = visibleRows.slice(0, limit)
    const context = await buildFeedContext()
    const items = pageRows.map((entry) =>
      toListItem(entry, context, { withSummary: options.withSummary }),
    )
    const last = pageRows.at(-1)

    return {
      items,
      page: {
        limit,
        hasMore: visibleRows.length > limit,
        nextCursor: last
          ? encodeAgentEntriesCursor({
              publishedAt: safeTimestamp(last.publishedAt) ?? 0,
              insertedAt: safeTimestamp(last.insertedAt) ?? 0,
              id: last.id,
            })
          : null,
      },
    }
  }

  async getEntry(entryId: string): Promise<AgentEntryDetail | null> {
    const db = DBManager.getDB()
    const entry = ((await db.query.entriesTable.findFirst({
      where: (entries: any) => and(eq(entries.id, entryId), isNull(entries.deletedAt)),
    })) ?? null) as EntryRow | null
    if (!entry) return null

    const visibility = await getActiveVisibilityState()
    if (!isEntryVisibleForActiveRelations(entry as any, visibility)) return null

    const context = await buildFeedContext()
    const base = toListItem(entry, context)
    const selected = selectAgentEntryContent(entry)
    return {
      ...base,
      content: selected.content,
      contentSource: selected.contentSource,
      description: entry.description ?? null,
    }
  }

  async listFeeds(): Promise<AgentFeedsListResult> {
    const [feeds, subscriptions, unreadCounts] = await Promise.all([
      FeedService.getFeedAll() as Promise<FeedRow[]>,
      SubscriptionService.getSubscriptionAll() as Promise<SubscriptionRow[]>,
      unreadApplicationService.listUnreadCounts(),
    ])

    const feedById = new Map(feeds.map((feed) => [feed.id, feed]))
    const unreadById = new Map(unreadCounts.map((item) => [item.id, item.count]))
    const items: AgentFeedListItem[] = []

    for (const subscription of subscriptions) {
      if (subscription.type !== "feed" || !subscription.feedId) continue
      const feed = feedById.get(subscription.feedId)
      if (!feed) continue
      items.push({
        id: subscription.feedId,
        subscriptionId: subscription.id,
        title: normalizeTitle(subscription.title || feed.title, subscription.feedId),
        url: feed.url ?? null,
        siteUrl: feed.siteUrl ?? null,
        category: subscription.category ?? null,
        unreadCount: unreadById.get(subscription.feedId) ?? 0,
      })
    }

    items.sort((a, b) => {
      const categoryCompare = (a.category || "").localeCompare(b.category || "")
      if (categoryCompare !== 0) return categoryCompare
      return a.title.localeCompare(b.title)
    })

    return { items }
  }

  async updateReadStatus(payload: {
    entryIds: string[]
    read: boolean
  }): Promise<AgentReadStatusResult> {
    const entryIds = Array.from(new Set(payload.entryIds.map((id) => id.trim()).filter(Boolean)))
    if (entryIds.length === 0) {
      throw new AgentApplicationError("SUHUI_INVALID_ENTRY_IDS", "entryIds must not be empty", 400)
    }

    await EntryService.patchMany({
      entryIds,
      entry: { read: payload.read },
    })

    return {
      updated: entryIds.length,
      read: payload.read,
    }
  }
}

export const agentApplicationService = new AgentApplicationService()
```

- [ ] **Step 4: Run the focused service test**

Run:

```bash
pnpm --filter @suhui/electron-main test -- src/application/agent/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/layer/main/src/application/agent
git commit -m "feat: add agent application service"
```

---

### Task 3: Wire Agent API Routes Into Remote Server

**Files:**

- Modify: `apps/desktop/layer/main/src/remote/manager.ts`
- Modify: `apps/desktop/layer/main/src/remote/manager.test.ts`

- [ ] **Step 1: Add failing route tests**

Append these tests inside `describe("RemoteServerManager", () => { ... })` in `apps/desktop/layer/main/src/remote/manager.test.ts`, before the final closing `})`:

```ts
it("serves agent entries with query options", async () => {
  const getAgentEntries = vi.fn().mockResolvedValue({
    items: [{ id: "entry-1", feedId: "feed-1", feedTitle: "Feed One", title: "Hello" }],
    page: { limit: 5, nextCursor: null, hasMore: false },
  })
  const server = await RemoteServerManager.start({
    host: "127.0.0.1",
    port: 0,
    getSubscriptions: vi.fn().mockResolvedValue([]),
    getEntries: vi.fn().mockResolvedValue([]),
    getAgentEntries,
  } as any)

  const response = await fetch(
    `${server.baseUrl}/api/agent/entries?feedId=feed-1&read=false&limit=5&cursor=abc&withSummary=1`,
  )

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    data: {
      items: [{ id: "entry-1", feedId: "feed-1", feedTitle: "Feed One", title: "Hello" }],
      page: { limit: 5, nextCursor: null, hasMore: false },
    },
  })
  expect(getAgentEntries).toHaveBeenCalledWith({
    feedId: "feed-1",
    read: false,
    limit: 5,
    cursor: "abc",
    withSummary: true,
  })
})

it("returns 404 for missing agent entry detail", async () => {
  const server = await RemoteServerManager.start({
    host: "127.0.0.1",
    port: 0,
    getSubscriptions: vi.fn().mockResolvedValue([]),
    getEntries: vi.fn().mockResolvedValue([]),
    getAgentEntry: vi.fn().mockResolvedValue(null),
  } as any)

  const response = await fetch(`${server.baseUrl}/api/agent/entries/missing-entry`)

  expect(response.status).toBe(404)
  await expect(response.json()).resolves.toEqual({
    error: {
      code: "SUHUI_ENTRY_NOT_FOUND",
      message: "Entry not found",
    },
  })
})

it("serves agent feeds and updates read status", async () => {
  const getAgentFeeds = vi.fn().mockResolvedValue({
    items: [{ id: "feed-1", subscriptionId: "feed/feed-1", title: "Feed One", unreadCount: 3 }],
  })
  const updateAgentReadStatus = vi.fn().mockResolvedValue({ updated: 2, read: true })
  const server = await RemoteServerManager.start({
    host: "127.0.0.1",
    port: 0,
    getSubscriptions: vi.fn().mockResolvedValue([]),
    getEntries: vi.fn().mockResolvedValue([]),
    getAgentFeeds,
    updateAgentReadStatus,
  } as any)

  const feedsResponse = await fetch(`${server.baseUrl}/api/agent/feeds`)
  expect(feedsResponse.status).toBe(200)
  await expect(feedsResponse.json()).resolves.toEqual({
    data: {
      items: [{ id: "feed-1", subscriptionId: "feed/feed-1", title: "Feed One", unreadCount: 3 }],
    },
  })

  const readResponse = await fetch(`${server.baseUrl}/api/agent/entries/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entryIds: ["entry-1", "entry-2"], read: true }),
  })
  expect(readResponse.status).toBe(200)
  await expect(readResponse.json()).resolves.toEqual({ data: { updated: 2, read: true } })
  expect(updateAgentReadStatus).toHaveBeenCalledWith({
    entryIds: ["entry-1", "entry-2"],
    read: true,
  })
})
```

- [ ] **Step 2: Run remote tests and verify they fail**

Run:

```bash
pnpm --filter @suhui/electron-main test -- src/remote/manager.test.ts
```

Expected: FAIL because `RemoteServerManager.start()` does not accept the injected agent providers and routes return `REMOTE_ROUTE_NOT_FOUND`.

- [ ] **Step 3: Extend `RemoteServerDependencies` in `manager.ts`**

In `apps/desktop/layer/main/src/remote/manager.ts`, add this import near the other application imports:

```ts
import { agentApplicationService } from "~/application/agent/service"
import { AgentApplicationError } from "~/application/agent/types"
```

Add these dependency fields to `type RemoteServerDependencies`:

```ts
getAgentEntries: (options?: {
  feedId?: string
  read?: boolean
  limit?: number
  cursor?: string
  withSummary?: boolean
}) => Promise<unknown>
getAgentEntry: (entryId: string) => Promise<unknown | null>
getAgentFeeds: () => Promise<unknown>
updateAgentReadStatus: (payload: { entryIds: string[]; read: boolean }) => Promise<unknown>
```

- [ ] **Step 4: Add agent route helpers in `manager.ts`**

Near `readJsonBody`, add:

```ts
const parseBooleanParam = (value: string | null): boolean | undefined => {
  if (value === null || value === "") return undefined
  const normalized = value.toLowerCase()
  if (["1", "true"].includes(normalized)) return true
  if (["0", "false"].includes(normalized)) return false
  return undefined
}

const agentError = (response: ServerResponse, error: unknown) => {
  if (error instanceof AgentApplicationError) {
    json(response, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
      },
    })
    return
  }

  json(response, 500, {
    error: {
      code: "SUHUI_AGENT_INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Agent API failed",
    },
  })
}
```

- [ ] **Step 5: Add `/api/agent/*` routes before existing `/api/entries/*` routes**

In `createRequestHandler`, insert this block after `/api/settings` handling and before `if (method === "GET" && url.pathname === "/api/entries")`:

```ts
if (method === "GET" && url.pathname === "/api/agent/entries") {
  try {
    const read = parseBooleanParam(url.searchParams.get("read"))
    const result = await deps.getAgentEntries({
      feedId: url.searchParams.get("feedId") || undefined,
      read,
      limit: url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      withSummary: ["1", "true"].includes(
        (url.searchParams.get("withSummary") || "").toLowerCase(),
      ),
    })
    json(response, 200, { data: result })
  } catch (error) {
    agentError(response, error)
  }
  return
}

if (method === "GET" && url.pathname === "/api/agent/feeds") {
  try {
    json(response, 200, { data: await deps.getAgentFeeds() })
  } catch (error) {
    agentError(response, error)
  }
  return
}

if (method === "POST" && url.pathname === "/api/agent/entries/read") {
  try {
    const payload = await readJsonBody<{ entryIds: string[]; read: boolean }>(request)
    const result = await deps.updateAgentReadStatus(payload)
    json(response, 200, { data: result })
  } catch (error) {
    agentError(response, error)
  }
  return
}

if (method === "GET" && url.pathname.startsWith("/api/agent/entries/")) {
  try {
    const entryId = decodeURIComponent(url.pathname.replace("/api/agent/entries/", ""))
    const entry = await deps.getAgentEntry(entryId)
    if (!entry) {
      json(response, 404, {
        error: {
          code: "SUHUI_ENTRY_NOT_FOUND",
          message: "Entry not found",
        },
      })
      return
    }
    json(response, 200, { data: entry })
  } catch (error) {
    agentError(response, error)
  }
  return
}
```

- [ ] **Step 6: Wire default and injected dependencies**

In the `deps` default object, add:

```ts
    getAgentEntries: (options) => agentApplicationService.listEntries(options),
    getAgentEntry: (entryId) => agentApplicationService.getEntry(entryId),
    getAgentFeeds: () => agentApplicationService.listFeeds(),
    updateAgentReadStatus: async (payload) => {
      const result = await agentApplicationService.updateReadStatus(payload)
      this.broadcast("entries.updated", {})
      this.broadcast("subscriptions.updated", {})
      return result
    },
```

In `start(options?: StartOptions)`, extend the spread list with:

```ts
      ...(options?.getAgentEntries ? { getAgentEntries: options.getAgentEntries } : {}),
      ...(options?.getAgentEntry ? { getAgentEntry: options.getAgentEntry } : {}),
      ...(options?.getAgentFeeds ? { getAgentFeeds: options.getAgentFeeds } : {}),
      ...(options?.updateAgentReadStatus
        ? { updateAgentReadStatus: options.updateAgentReadStatus }
        : {}),
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm --filter @suhui/electron-main test -- src/application/agent/service.test.ts src/remote/manager.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/layer/main/src/application/agent \
  apps/desktop/layer/main/src/remote/manager.ts \
  apps/desktop/layer/main/src/remote/manager.test.ts
git commit -m "feat: expose agent remote api"
```

---

### Task 4: Scaffold CLI Workspace And Testable Runtime

**Files:**

- Modify: `pnpm-workspace.yaml`
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`
- Create: `apps/cli/vitest.config.ts`
- Create: `apps/cli/src/types.ts`
- Create: `apps/cli/src/config.ts`
- Create: `apps/cli/src/args.ts`
- Create: `apps/cli/src/args.test.ts`
- Create: `apps/cli/src/index.ts`

- [ ] **Step 1: Update workspace**

Modify `pnpm-workspace.yaml` so the top `packages:` block starts with:

```yaml
packages:
  - apps/desktop
  - apps/cli
  - packages/**/*
  - apps/desktop/layer/*
```

- [ ] **Step 2: Create CLI package metadata**

Create `apps/cli/package.json`:

```json
{
  "name": "@suhui/cli",
  "type": "module",
  "version": "0.0.0",
  "private": true,
  "bin": {
    "suhui": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "25.2.3",
    "tsx": "4.21.0",
    "typescript": "catalog:",
    "vitest": "3.2.4"
  }
}
```

- [ ] **Step 3: Add TypeScript and Vitest configs**

Create `apps/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "noEmit": false,
    "declaration": true,
    "declarationMap": false,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "dist"]
}
```

Create `apps/cli/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
})
```

- [ ] **Step 4: Add CLI types**

Create `apps/cli/src/types.ts`:

```ts
export type OutputFormat = "markdown" | "json"
export type ContentMode = "full" | "summary" | "metadata"

export const defaultBaseUrl = "http://127.0.0.1:41595"
export const defaultFormat: OutputFormat = "markdown"
export const defaultMaxChars = 12000

export const exitCodes = {
  success: 0,
  usage: 1,
  remoteUnavailable: 2,
  notFound: 3,
  unexpectedResponse: 4,
} as const

export type CliExitCode = (typeof exitCodes)[keyof typeof exitCodes]

export type CliErrorCode =
  | "SUHUI_USAGE_ERROR"
  | "SUHUI_REMOTE_UNAVAILABLE"
  | "SUHUI_NOT_FOUND"
  | "SUHUI_UNEXPECTED_RESPONSE"
  | "SUHUI_EXECUTION_ERROR"

export class CliError extends Error {
  constructor(
    readonly code: CliErrorCode,
    message: string,
    readonly exitCode: CliExitCode,
  ) {
    super(message)
    this.name = "CliError"
  }
}

export type CliCommand =
  | {
      kind: "entries.list"
      baseUrl: string
      format: OutputFormat
      feedId?: string
      read?: boolean
      limit?: number
      cursor?: string
      withSummary: boolean
    }
  | {
      kind: "entries.get"
      baseUrl: string
      format: OutputFormat
      entryId: string
      content: ContentMode
      maxChars: number
    }
  | {
      kind: "feeds.list"
      baseUrl: string
      format: OutputFormat
    }
  | {
      kind: "entries.read"
      baseUrl: string
      format: OutputFormat
      entryIds: string[]
      read: boolean
    }

export type AgentEntryListItem = {
  id: string
  feedId: string | null
  feedTitle: string
  title: string
  url: string | null
  author: string | null
  publishedAt: number | null
  publishedAtIso: string | null
  insertedAt: number | null
  insertedAtIso: string | null
  read: boolean
  summary?: string | null
}

export type AgentEntriesListResult = {
  items: AgentEntryListItem[]
  page: {
    limit: number
    nextCursor: string | null
    hasMore: boolean
  }
}

export type AgentEntryDetail = AgentEntryListItem & {
  content: string
  contentSource: "readabilityContent" | "content" | "description" | "none"
  description: string | null
}

export type AgentFeedsListResult = {
  items: Array<{
    id: string
    subscriptionId: string
    title: string
    url: string | null
    siteUrl: string | null
    category: string | null
    unreadCount: number
  }>
}

export type AgentReadStatusResult = {
  updated: number
  read: boolean
}
```

- [ ] **Step 5: Add config and argument parser**

Create `apps/cli/src/config.ts`:

```ts
import { CliError, defaultBaseUrl, defaultFormat, exitCodes, type OutputFormat } from "./types.js"

export type CliEnv = Record<string, string | undefined>

export const resolveBaseUrl = (input: { baseUrl?: string; env: CliEnv }) => {
  const value = input.baseUrl || input.env.SUHUI_CLI_BASE_URL || defaultBaseUrl
  return value.replace(/\/+$/, "")
}

export const parseFormat = (value: string | undefined): OutputFormat => {
  if (!value) return defaultFormat
  if (value === "markdown" || value === "json") return value
  throw new CliError("SUHUI_USAGE_ERROR", "--format must be markdown or json", exitCodes.usage)
}
```

Create `apps/cli/src/args.ts`:

```ts
import { parseFormat, resolveBaseUrl, type CliEnv } from "./config.js"
import { CliError, defaultMaxChars, exitCodes, type CliCommand, type ContentMode } from "./types.js"

const readOption = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    throw new CliError("SUHUI_USAGE_ERROR", `${name} requires a value`, exitCodes.usage)
  }
  return value
}

const hasFlag = (args: string[], name: string) => args.includes(name)

const parseNumberOption = (args: string[], name: string): number | undefined => {
  const value = readOption(args, name)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new CliError("SUHUI_USAGE_ERROR", `${name} must be a number`, exitCodes.usage)
  }
  return Math.trunc(parsed)
}

const parseContentMode = (value: string | undefined): ContentMode => {
  if (!value) return "full"
  if (value === "full" || value === "summary" || value === "metadata") return value
  throw new CliError(
    "SUHUI_USAGE_ERROR",
    "--content must be full, summary, or metadata",
    exitCodes.usage,
  )
}

const removeGlobalOptions = (args: string[]) => {
  const output: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === "--base-url" || arg === "--format") {
      index++
      continue
    }
    output.push(arg)
  }
  return output
}

export const parseArgs = (argv: string[], env: CliEnv): CliCommand => {
  const baseUrl = resolveBaseUrl({ baseUrl: readOption(argv, "--base-url"), env })
  const format = parseFormat(readOption(argv, "--format"))
  const args = removeGlobalOptions(argv)
  const [group, action, ...rest] = args

  if (group === "entries" && action === "list") {
    const readFlag = hasFlag(rest, "--read")
    const unreadFlag = hasFlag(rest, "--unread")
    if (readFlag && unreadFlag) {
      throw new CliError("SUHUI_USAGE_ERROR", "Use only one of --read or --unread", exitCodes.usage)
    }
    return {
      kind: "entries.list",
      baseUrl,
      format,
      feedId: readOption(rest, "--feed"),
      read: readFlag ? true : unreadFlag ? false : undefined,
      limit: parseNumberOption(rest, "--limit"),
      cursor: readOption(rest, "--cursor"),
      withSummary: hasFlag(rest, "--with-summary"),
    }
  }

  if (group === "entries" && action === "get") {
    const entryId = rest.find((arg) => !arg.startsWith("--"))
    if (!entryId) {
      throw new CliError("SUHUI_USAGE_ERROR", "entries get requires an entry id", exitCodes.usage)
    }
    return {
      kind: "entries.get",
      baseUrl,
      format,
      entryId,
      content: parseContentMode(readOption(rest, "--content")),
      maxChars: parseNumberOption(rest, "--max-chars") ?? defaultMaxChars,
    }
  }

  if (group === "feeds" && action === "list") {
    return { kind: "feeds.list", baseUrl, format }
  }

  if (group === "entries" && (action === "mark-read" || action === "mark-unread")) {
    const entryIds = rest.filter((arg) => !arg.startsWith("--"))
    if (entryIds.length === 0) {
      throw new CliError(
        "SUHUI_USAGE_ERROR",
        `${action} requires at least one entry id`,
        exitCodes.usage,
      )
    }
    return {
      kind: "entries.read",
      baseUrl,
      format,
      entryIds,
      read: action === "mark-read",
    }
  }

  throw new CliError(
    "SUHUI_USAGE_ERROR",
    "Usage: suhui entries list|get|mark-read|mark-unread or suhui feeds list",
    exitCodes.usage,
  )
}
```

- [ ] **Step 6: Add parser tests**

Create `apps/cli/src/args.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { parseArgs } from "./args"
import { CliError } from "./types"

describe("parseArgs", () => {
  it("defaults to markdown and localhost base URL for entries list", () => {
    expect(parseArgs(["entries", "list", "--limit", "5", "--unread"], {})).toEqual({
      kind: "entries.list",
      baseUrl: "http://127.0.0.1:41595",
      format: "markdown",
      feedId: undefined,
      read: false,
      limit: 5,
      cursor: undefined,
      withSummary: false,
    })
  })

  it("allows env and CLI base URL overrides", () => {
    expect(
      parseArgs(["entries", "get", "entry-1"], { SUHUI_CLI_BASE_URL: "http://localhost:9999/" })
        .baseUrl,
    ).toBe("http://localhost:9999")

    expect(
      parseArgs(["--base-url", "http://localhost:8888/", "feeds", "list"], {
        SUHUI_CLI_BASE_URL: "http://localhost:9999",
      }).baseUrl,
    ).toBe("http://localhost:8888")
  })

  it("rejects conflicting read filters and missing ids", () => {
    expect(() => parseArgs(["entries", "list", "--read", "--unread"], {})).toThrow(CliError)
    expect(() => parseArgs(["entries", "mark-read"], {})).toThrow(CliError)
  })
})
```

- [ ] **Step 7: Add process entrypoint**

Create `apps/cli/src/index.ts`:

```ts
#!/usr/bin/env node

import { runCli } from "./run.js"

const result = await runCli({
  argv: process.argv.slice(2),
  env: process.env,
  fetch: globalThis.fetch,
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
process.exitCode = result.exitCode
```

The `run.ts` import will fail until Task 6; that is acceptable for this scaffold task if only `args.test.ts` is run.

- [ ] **Step 8: Run parser tests**

Run:

```bash
pnpm --filter @suhui/cli test -- src/args.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add pnpm-workspace.yaml apps/cli
git commit -m "feat: scaffold suhui cli package"
```

---

### Task 5: Add CLI HTTP Client And Formatters

**Files:**

- Create: `apps/cli/src/http.ts`
- Create: `apps/cli/src/format.ts`
- Create: `apps/cli/src/http.test.ts`
- Create: `apps/cli/src/format.test.ts`

- [ ] **Step 1: Add HTTP client tests**

Create `apps/cli/src/http.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import { requestJson } from "./http"
import { CliError, exitCodes } from "./types"

describe("requestJson", () => {
  it("returns response data", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    })

    await expect(requestJson("http://localhost/test", { fetch })).resolves.toEqual({ ok: true })
  })

  it("maps connection failures to remote unavailable", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))

    await expect(requestJson("http://localhost/test", { fetch })).rejects.toMatchObject({
      code: "SUHUI_REMOTE_UNAVAILABLE",
      exitCode: exitCodes.remoteUnavailable,
    } satisfies Partial<CliError>)
  })

  it("maps 404 to not found", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: "SUHUI_ENTRY_NOT_FOUND", message: "Entry not found" } }),
    })

    await expect(requestJson("http://localhost/test", { fetch })).rejects.toMatchObject({
      code: "SUHUI_NOT_FOUND",
      exitCode: exitCodes.notFound,
    } satisfies Partial<CliError>)
  })
})
```

- [ ] **Step 2: Add formatter tests**

Create `apps/cli/src/format.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  formatEntriesListMarkdown,
  formatEntryDetailMarkdown,
  formatFeedsMarkdown,
  htmlToMarkdown,
  truncateMarkdown,
} from "./format"

describe("htmlToMarkdown", () => {
  it("converts simple HTML to readable markdown", () => {
    expect(
      htmlToMarkdown('<h1>Hello</h1><p>Read <a href="https://example.com">more</a>.</p>'),
    ).toContain("# Hello\n\nRead [more](https://example.com).")
  })
})

describe("markdown formatters", () => {
  it("formats entries list without summaries by default", () => {
    const output = formatEntriesListMarkdown({
      items: [
        {
          id: "entry-1",
          feedId: "feed-1",
          feedTitle: "Feed One",
          title: "Hello",
          url: "https://example.com",
          author: null,
          publishedAt: 1710000000000,
          publishedAtIso: "2024-03-09T16:00:00.000Z",
          insertedAt: 1710000001000,
          insertedAtIso: "2024-03-09T16:00:01.000Z",
          read: false,
        },
      ],
      page: { limit: 20, nextCursor: "cursor-1", hasMore: true },
    })

    expect(output).toContain("# Suhui Entries")
    expect(output).toContain("[Unread] Hello")
    expect(output).toContain("ID: `entry-1`")
    expect(output).toContain("Next cursor: `cursor-1`")
  })

  it("formats entry detail and truncates long content", () => {
    const output = formatEntryDetailMarkdown(
      {
        id: "entry-1",
        feedId: "feed-1",
        feedTitle: "Feed One",
        title: "Hello",
        url: "https://example.com",
        author: "Ann",
        publishedAt: 1710000000000,
        publishedAtIso: "2024-03-09T16:00:00.000Z",
        insertedAt: 1710000001000,
        insertedAtIso: "2024-03-09T16:00:01.000Z",
        read: false,
        content: "<p>1234567890</p>",
        contentSource: "content",
        description: "Summary",
      },
      { content: "full", maxChars: 5 },
    )

    expect(output).toContain("# Hello")
    expect(output).toContain("12345")
    expect(output).toContain("Content truncated")
  })

  it("formats feeds by category", () => {
    const output = formatFeedsMarkdown({
      items: [
        {
          id: "feed-1",
          subscriptionId: "feed/feed-1",
          title: "Feed One",
          url: "https://example.com/rss.xml",
          siteUrl: "https://example.com",
          category: "Tech",
          unreadCount: 2,
        },
      ],
    })

    expect(output).toContain("# Suhui Feeds")
    expect(output).toContain("## Tech")
    expect(output).toContain("Unread: 2")
  })

  it("marks truncated content", () => {
    expect(truncateMarkdown("abcdef", 3)).toBe("abc\n\n_Content truncated at 3 characters._")
  })
})
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm --filter @suhui/cli test -- src/http.test.ts src/format.test.ts
```

Expected: FAIL because `http.ts` and `format.ts` do not exist.

- [ ] **Step 4: Implement `http.ts`**

Create `apps/cli/src/http.ts`:

```ts
import { CliError, exitCodes } from "./types.js"

type FetchLike = typeof fetch

export const requestJson = async <T>(
  url: string,
  options: {
    fetch: FetchLike
    method?: string
    body?: unknown
  },
): Promise<T> => {
  let response: Response
  try {
    response = await options.fetch(url, {
      method: options.method,
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new CliError(
      "SUHUI_REMOTE_UNAVAILABLE",
      `Cannot connect to Suhui remote API at ${new URL(url).origin}`,
      exitCodes.remoteUnavailable,
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new CliError(
      "SUHUI_UNEXPECTED_RESPONSE",
      "Remote API returned invalid JSON",
      exitCodes.unexpectedResponse,
    )
  }

  if (!response.ok) {
    const error = (payload as any)?.error
    const message = typeof error?.message === "string" ? error.message : `HTTP ${response.status}`
    if (response.status === 404) {
      throw new CliError("SUHUI_NOT_FOUND", message, exitCodes.notFound)
    }
    throw new CliError("SUHUI_EXECUTION_ERROR", message, exitCodes.usage)
  }

  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new CliError(
      "SUHUI_UNEXPECTED_RESPONSE",
      "Remote API response is missing data",
      exitCodes.unexpectedResponse,
    )
  }

  return (payload as { data: T }).data
}
```

- [ ] **Step 5: Implement `format.ts`**

Create `apps/cli/src/format.ts`:

```ts
import type {
  AgentEntriesListResult,
  AgentEntryDetail,
  AgentFeedsListResult,
  CliError,
  ContentMode,
} from "./types.js"

const decodeEntities = (value: string) =>
  value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")

export const htmlToMarkdown = (html: string): string => {
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const localTime = (value: number | null) => {
  if (!value) return "Unknown time"
  const date = new Date(value)
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  const hh = `${date.getHours()}`.padStart(2, "0")
  const min = `${date.getMinutes()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

export const truncateMarkdown = (value: string, maxChars: number) => {
  if (maxChars <= 0 || value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n\n_Content truncated at ${maxChars} characters._`
}

export const formatEntriesListMarkdown = (result: AgentEntriesListResult) => {
  const lines = ["# Suhui Entries", ""]
  if (result.items.length === 0) {
    lines.push("_No entries found._")
  }
  for (const item of result.items) {
    lines.push(`- [${item.read ? "Read" : "Unread"}] ${item.title}`)
    lines.push(`  - ID: \`${item.id}\``)
    lines.push(`  - Feed: ${item.feedTitle}`)
    lines.push(`  - Published: ${localTime(item.publishedAt)}`)
    if (item.url) lines.push(`  - URL: ${item.url}`)
    if (item.summary) lines.push(`  - Summary: ${item.summary}`)
  }
  if (result.page.hasMore && result.page.nextCursor) {
    lines.push("", `Next cursor: \`${result.page.nextCursor}\``)
  }
  return `${lines.join("\n")}\n`
}

export const formatEntryDetailMarkdown = (
  item: AgentEntryDetail,
  options: { content: ContentMode; maxChars: number },
) => {
  const lines = [`# ${item.title}`, ""]
  lines.push(`- ID: \`${item.id}\``)
  lines.push(`- Feed: ${item.feedTitle}`)
  lines.push(`- Published: ${localTime(item.publishedAt)}`)
  lines.push(`- Status: ${item.read ? "Read" : "Unread"}`)
  if (item.author) lines.push(`- Author: ${item.author}`)
  if (item.url) lines.push(`- URL: ${item.url}`)

  if (options.content === "metadata") return `${lines.join("\n")}\n`

  if (options.content === "summary") {
    lines.push("", "## Summary", "", item.description || "_No summary available._")
    return `${truncateMarkdown(lines.join("\n"), options.maxChars)}\n`
  }

  const markdown = htmlToMarkdown(item.content || item.description || "")
  lines.push("", "## Content", "", markdown || "_No content available._")
  return `${truncateMarkdown(lines.join("\n"), options.maxChars)}\n`
}

export const formatFeedsMarkdown = (result: AgentFeedsListResult) => {
  const lines = ["# Suhui Feeds", ""]
  const groups = new Map<string, typeof result.items>()
  for (const item of result.items) {
    const key = item.category || "Uncategorized"
    groups.set(key, [...(groups.get(key) || []), item])
  }
  for (const [category, items] of groups) {
    lines.push(`## ${category}`, "")
    for (const item of items) {
      lines.push(`- ${item.title}`)
      lines.push(`  - ID: \`${item.id}\``)
      lines.push(`  - Subscription ID: \`${item.subscriptionId}\``)
      lines.push(`  - Unread: ${item.unreadCount}`)
      if (item.url) lines.push(`  - Feed URL: ${item.url}`)
      if (item.siteUrl) lines.push(`  - Site URL: ${item.siteUrl}`)
    }
    lines.push("")
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n")
}

export const formatReadStatusMarkdown = (result: { updated: number; read: boolean }) =>
  `Updated ${result.updated} entr${result.updated === 1 ? "y" : "ies"} to ${result.read ? "read" : "unread"}.\n`

export const formatError = (error: CliError, format: "markdown" | "json") => {
  if (format === "json") {
    return `${JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2)}\n`
  }
  return `Error: ${error.message}\n`
}
```

- [ ] **Step 6: Run formatter and HTTP tests**

Run:

```bash
pnpm --filter @suhui/cli test -- src/http.test.ts src/format.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/cli/src/http.ts apps/cli/src/http.test.ts \
  apps/cli/src/format.ts apps/cli/src/format.test.ts
git commit -m "feat: add cli http and formatters"
```

---

### Task 6: Implement CLI Commands Through `runCli`

**Files:**

- Create: `apps/cli/src/run.ts`
- Create: `apps/cli/src/run.test.ts`
- Modify: `apps/cli/src/index.ts`

- [ ] **Step 1: Add runner tests**

Create `apps/cli/src/run.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import { runCli } from "./run"

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ data }),
})

describe("runCli", () => {
  it("prints markdown entries list by default", async () => {
    const fetch = vi.fn().mockResolvedValue(
      ok({
        items: [
          {
            id: "entry-1",
            feedId: "feed-1",
            feedTitle: "Feed One",
            title: "Hello",
            url: "https://example.com",
            author: null,
            publishedAt: 1710000000000,
            publishedAtIso: "2024-03-09T16:00:00.000Z",
            insertedAt: 1710000001000,
            insertedAtIso: "2024-03-09T16:00:01.000Z",
            read: false,
          },
        ],
        page: { limit: 20, nextCursor: null, hasMore: false },
      }),
    )

    const result = await runCli({ argv: ["entries", "list"], env: {}, fetch: fetch as any })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("# Suhui Entries")
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:41595/api/agent/entries",
      expect.any(Object),
    )
  })

  it("prints json when requested", async () => {
    const data = { items: [], page: { limit: 20, nextCursor: null, hasMore: false } }
    const fetch = vi.fn().mockResolvedValue(ok(data))

    const result = await runCli({
      argv: ["entries", "list", "--format", "json"],
      env: {},
      fetch: fetch as any,
    })

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(data)
  })

  it("posts explicit read status updates", async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ updated: 2, read: true }))

    const result = await runCli({
      argv: ["entries", "mark-read", "entry-1", "entry-2"],
      env: {},
      fetch: fetch as any,
    })

    expect(result.exitCode).toBe(0)
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:41595/api/agent/entries/read",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ entryIds: ["entry-1", "entry-2"], read: true }),
      }),
    )
  })

  it("returns stable exit code for remote unavailable", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))

    const result = await runCli({ argv: ["feeds", "list"], env: {}, fetch: fetch as any })

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("Cannot connect to Suhui remote API")
  })

  it("returns usage error for conflicting filters", async () => {
    const result = await runCli({
      argv: ["entries", "list", "--read", "--unread"],
      env: {},
      fetch: vi.fn() as any,
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Use only one of --read or --unread")
  })
})
```

- [ ] **Step 2: Run runner tests and verify they fail**

Run:

```bash
pnpm --filter @suhui/cli test -- src/run.test.ts
```

Expected: FAIL because `run.ts` does not exist.

- [ ] **Step 3: Implement `run.ts`**

Create `apps/cli/src/run.ts`:

```ts
import { parseArgs } from "./args.js"
import {
  formatEntriesListMarkdown,
  formatEntryDetailMarkdown,
  formatError,
  formatFeedsMarkdown,
  formatReadStatusMarkdown,
} from "./format.js"
import { requestJson } from "./http.js"
import {
  CliError,
  exitCodes,
  type AgentEntriesListResult,
  type AgentEntryDetail,
  type AgentFeedsListResult,
  type AgentReadStatusResult,
  type CliCommand,
} from "./types.js"

type FetchLike = typeof fetch

type RunCliInput = {
  argv: string[]
  env: Record<string, string | undefined>
  fetch: FetchLike
}

type RunCliResult = {
  exitCode: number
  stdout: string
  stderr: string
}

const jsonOutput = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

const buildEntriesListUrl = (command: Extract<CliCommand, { kind: "entries.list" }>) => {
  const params = new URLSearchParams()
  if (command.feedId) params.set("feedId", command.feedId)
  if (typeof command.read === "boolean") params.set("read", String(command.read))
  if (typeof command.limit === "number") params.set("limit", String(command.limit))
  if (command.cursor) params.set("cursor", command.cursor)
  if (command.withSummary) params.set("withSummary", "1")
  const query = params.toString()
  return `${command.baseUrl}/api/agent/entries${query ? `?${query}` : ""}`
}

const execute = async (command: CliCommand, fetch: FetchLike): Promise<string> => {
  if (command.kind === "entries.list") {
    const data = await requestJson<AgentEntriesListResult>(buildEntriesListUrl(command), { fetch })
    return command.format === "json" ? jsonOutput(data) : formatEntriesListMarkdown(data)
  }

  if (command.kind === "entries.get") {
    const data = await requestJson<AgentEntryDetail>(
      `${command.baseUrl}/api/agent/entries/${encodeURIComponent(command.entryId)}`,
      { fetch },
    )
    return command.format === "json"
      ? jsonOutput(data)
      : formatEntryDetailMarkdown(data, { content: command.content, maxChars: command.maxChars })
  }

  if (command.kind === "feeds.list") {
    const data = await requestJson<AgentFeedsListResult>(`${command.baseUrl}/api/agent/feeds`, {
      fetch,
    })
    return command.format === "json" ? jsonOutput(data) : formatFeedsMarkdown(data)
  }

  const data = await requestJson<AgentReadStatusResult>(
    `${command.baseUrl}/api/agent/entries/read`,
    {
      fetch,
      method: "POST",
      body: { entryIds: command.entryIds, read: command.read },
    },
  )
  return command.format === "json" ? jsonOutput(data) : formatReadStatusMarkdown(data)
}

export const runCli = async (input: RunCliInput): Promise<RunCliResult> => {
  let format: "markdown" | "json" = "markdown"
  try {
    const command = parseArgs(input.argv, input.env)
    format = command.format
    return {
      exitCode: exitCodes.success,
      stdout: await execute(command, input.fetch),
      stderr: "",
    }
  } catch (error) {
    const cliError =
      error instanceof CliError
        ? error
        : new CliError(
            "SUHUI_EXECUTION_ERROR",
            error instanceof Error ? error.message : "CLI execution failed",
            exitCodes.usage,
          )
    return {
      exitCode: cliError.exitCode,
      stdout: "",
      stderr: formatError(cliError, format),
    }
  }
}
```

- [ ] **Step 4: Run CLI tests**

Run:

```bash
pnpm --filter @suhui/cli test
```

Expected: PASS for args, http, format, and run tests.

- [ ] **Step 5: Build and typecheck CLI**

Run:

```bash
pnpm --filter @suhui/cli typecheck
pnpm --filter @suhui/cli build
```

Expected:

- Typecheck exits 0.
- Build exits 0 and creates `apps/cli/dist/index.js`.

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/run.ts apps/cli/src/run.test.ts apps/cli/src/index.ts
git commit -m "feat: implement suhui cli commands"
```

---

### Task 7: Add CLI README And End-To-End Focused Verification

**Files:**

- Create: `apps/cli/README.md`
- Modify if needed: `apps/cli/package.json`
- No production code changes unless verification reveals a defect.

- [ ] **Step 1: Add CLI README**

Create `apps/cli/README.md`:

````md
# Suhui CLI

Repo-local CLI for agent access to a running Suhui Desktop remote server.

## Requirements

Start Suhui Desktop first. The CLI does not start Electron and does not read Postgres directly.

Default remote API:

```text
http://127.0.0.1:41595
```

Override with:

```bash
SUHUI_CLI_BASE_URL=http://127.0.0.1:41595 pnpm --filter @suhui/cli dev -- entries list
pnpm --filter @suhui/cli dev -- --base-url http://127.0.0.1:41595 entries list
```

## Commands

```bash
pnpm --filter @suhui/cli dev -- entries list
pnpm --filter @suhui/cli dev -- entries list --limit 5 --unread
pnpm --filter @suhui/cli dev -- entries list --format json
pnpm --filter @suhui/cli dev -- entries get <entryId>
pnpm --filter @suhui/cli dev -- feeds list
pnpm --filter @suhui/cli dev -- entries mark-read <entryId>
pnpm --filter @suhui/cli dev -- entries mark-unread <entryId>
```

Markdown is the default output. Use `--format json` for stable machine-readable output.

## Exit Codes

- `0`: success
- `1`: usage or ordinary execution error
- `2`: remote API unavailable
- `3`: entry/feed not found
- `4`: unexpected remote response shape
````

- [ ] **Step 2: Run all focused tests**

Run:

```bash
pnpm --filter @suhui/electron-main test -- src/application/agent/service.test.ts src/remote/manager.test.ts
pnpm --filter @suhui/cli test
```

Expected: PASS.

- [ ] **Step 3: Run typechecks**

Run:

```bash
pnpm --filter @suhui/electron-main typecheck
pnpm --filter @suhui/cli typecheck
```

Expected: both exit 0.

- [ ] **Step 4: Run CLI build**

Run:

```bash
pnpm --filter @suhui/cli build
```

Expected: exits 0 and writes `apps/cli/dist`.

- [ ] **Step 5: Manually smoke test remote unavailable path**

With Suhui Desktop remote server stopped, run:

```bash
pnpm --filter @suhui/cli dev -- feeds list
echo $?
```

Expected:

- stderr contains `Cannot connect to Suhui remote API at http://127.0.0.1:41595`.
- exit code printed by `echo $?` is `2`.

- [ ] **Step 6: Optional manual smoke test against a running desktop app**

If Suhui Desktop is running and remote server is available, run:

```bash
pnpm --filter @suhui/cli dev -- entries list --limit 3
pnpm --filter @suhui/cli dev -- feeds list
```

Expected:

- Entries command prints `# Suhui Entries`.
- Feeds command prints `# Suhui Feeds`.
- No JSON or stack trace appears in default Markdown mode.

- [ ] **Step 7: Commit docs and any verification fixes**

```bash
git add apps/cli/README.md apps/cli/package.json
git commit -m "docs: document suhui cli usage"
```

---

## Self-Review Checklist

- [ ] Spec coverage:
  - Agent remote API list/detail/feed/read routes: Tasks 2 and 3.
  - Stable agent schema and content source: Tasks 1 and 2.
  - CLI default Markdown and optional JSON: Tasks 4, 5, and 6.
  - `--base-url` and `SUHUI_CLI_BASE_URL`: Task 4.
  - `limit/cursor/feed/read/unread/with-summary`: Tasks 2, 3, 4, and 6.
  - Explicit ID-only mark-read/mark-unread: Tasks 2, 3, 4, and 6.
  - No direct Postgres access by CLI: architecture and file boundaries.
  - No installer/PATH integration: explicitly excluded.
- [ ] Placeholder scan:
  - Search command: `rg -n "TB[D]|TO[D]O|implement late[r]|fill in detail[s]|appropriat[e]|similar t[o]" docs/loopx/plans/2026-06-05-suhui-agent-cli.md`
  - Expected: no matches that indicate incomplete instructions.
- [ ] Type consistency:
  - `AgentEntriesListResult`, `AgentEntryDetail`, `AgentFeedsListResult`, and `AgentReadStatusResult` names match between main API and CLI.
  - CLI `read=false` query maps to unread; `read=true` maps to read.
  - Exit code constants match the design document.
- [ ] Design drift:
  - No refresh commands.
  - No subscription add/delete/update commands.
  - No auth/token/localhost-only behavior.
  - No direct DB reads from CLI.

## Final Verification Command Set

Run these before claiming implementation complete:

```bash
pnpm --filter @suhui/electron-main test -- src/application/agent/service.test.ts src/remote/manager.test.ts
pnpm --filter @suhui/cli test
pnpm --filter @suhui/electron-main typecheck
pnpm --filter @suhui/cli typecheck
pnpm --filter @suhui/cli build
```

Expected: every command exits 0.
