import {
  activateMainDB,
  closeMainDBHandles,
  createMainDBHandles,
  getMainDB,
} from "@suhui/database/db.main"
import {
  collectionsTable,
  entriesTable,
  feedsTable,
  subscriptionsTable,
} from "@suhui/database/schemas/postgres"
import { like } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const databaseManager = vi.hoisted(() => ({
  getDB: vi.fn(),
  waitUntilUsable: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("electron", () => ({
  session: { defaultSession: { resolveProxy: vi.fn() } },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}))

vi.mock("electron-ipc-decorator", () => ({
  IpcMethod: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) => descriptor,
  IpcService: class {},
}))

vi.mock("~/manager/db", () => ({ DBManager: databaseManager }))
vi.mock("@suhui/database/db", async () => {
  const mainDb = await import("@suhui/database/db.main")
  return {
    get db() {
      return mainDb.getMainDB()
    },
  }
})

vi.mock("~/lib/store", () => ({
  store: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}))

vi.mock("~/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}))

vi.mock("~/manager/sync-applier", () => ({ drainPendingOps: vi.fn() }))
vi.mock("~/manager/sync-logger", () => ({ syncLogger: { record: vi.fn() } }))
vi.mock("~/manager/refresh-audit-log", () => ({ appendRefreshAuditTrace: vi.fn() }))
vi.mock("~/manager/local-feed-refresh-events", () => ({
  broadcastLocalFeedRefreshCompleted: vi.fn(),
}))

vi.mock("~/application/agent/service", () => ({
  agentApplicationService: {
    listEntries: vi.fn(),
    getEntry: vi.fn(),
    listFeeds: vi.fn(),
    updateReadStatus: vi.fn(),
  },
}))
vi.mock("~/application/collection/service", () => ({
  collectionApplicationService: { listCollections: vi.fn(), updateEntryStar: vi.fn() },
}))
vi.mock("~/application/discover/service", () => ({
  discoverApplicationService: { request: vi.fn() },
}))
vi.mock("~/application/entry/service", () => ({
  entryApplicationService: { updateReadStatus: vi.fn() },
}))
vi.mock("~/application/feed/service", () => ({
  feedApplicationService: { previewFeed: vi.fn(), refreshFeed: vi.fn(), refreshAllFeeds: vi.fn() },
}))
vi.mock("~/application/import-export/service", () => ({
  importExportApplicationService: { exportData: vi.fn(), importData: vi.fn() },
}))
vi.mock("~/application/pdf/service", () => ({
  pdfApplicationService: { renderEntryPdf: vi.fn() },
}))
vi.mock("~/application/rsshub/service", () => ({
  rsshubApplicationService: { getConfig: vi.fn(), setConfig: vi.fn(), precheck: vi.fn() },
}))
vi.mock("~/application/settings/service", () => ({
  settingsApplicationService: {
    getCapabilities: vi.fn().mockReturnValue({ auth: "none" }),
    getSettings: vi.fn().mockReturnValue({ appearance: "system", rsshubCustomUrl: "" }),
    updateSettings: vi.fn(),
  },
}))
vi.mock("~/application/subscription/service", () => ({
  subscriptionApplicationService: {
    listSubscriptions: vi.fn().mockResolvedValue([]),
    createSubscription: vi.fn(),
    deleteSubscription: vi.fn(),
    deleteSubscriptionsByTargets: vi.fn(),
    updateSubscription: vi.fn(),
    batchUpdateSubscriptions: vi.fn(),
  },
}))
vi.mock("~/application/unread/service", () => ({
  unreadApplicationService: { listUnreadCounts: vi.fn().mockResolvedValue([]) },
}))

import { DbService } from "~/ipc/services/db"
import { RemoteServerManager } from "~/remote/manager"

import type { EntryListQuery, EntrySummaryPage } from "./query-types"

const databaseUrl = process.env.SUHUI_PERFORMANCE_DB_URL
const describePostgres = databaseUrl ? describe : describe.skip
const prefix = "suhui_pg_transport_fr002_"
const baseTime = 8_000_000_000_000

const ids = {
  feedA: `${prefix}feed_a`,
  feedB: `${prefix}feed_b`,
  inactiveFeed: `${prefix}feed_inactive`,
  list: `${prefix}list`,
  inbox: `${prefix}inbox`,
  collectionEntry: `${prefix}entry_collection`,
  listEntry: `${prefix}entry_list`,
  inboxEntry: `${prefix}entry_inbox`,
  inactiveEntry: `${prefix}entry_inactive`,
  nullReadEntry: `${prefix}entry_null_read`,
  trueReadEntry: `${prefix}entry_true_read`,
}

const feedEntryIds = [
  `${prefix}entry_tie_b`,
  `${prefix}entry_tie_a`,
  `${prefix}entry_inserted`,
  `${prefix}entry_older_b`,
  `${prefix}entry_older_a`,
]

const makeEntry = (
  id: string,
  input: {
    feedId?: string | null
    inboxHandle?: string | null
    sources?: string[] | null
    read?: boolean | null
    publishedAt: number
    insertedAt: number
  },
) => ({
  id,
  title: `Postgres transport ${id}`,
  url: `https://fixture.invalid/${id}`,
  content: `full-body-${id}`,
  readabilityContent: `readability-body-${id}`,
  readabilityUpdatedAt: input.insertedAt,
  description: `summary-${id}`,
  guid: `guid-${id}`,
  insertedAt: input.insertedAt,
  publishedAt: input.publishedAt,
  feedId: input.feedId ?? null,
  inboxHandle: input.inboxHandle ?? null,
  sources: input.sources ?? null,
  read: input.read === undefined ? false : input.read,
})

const cleanupRows = async () => {
  const db = getMainDB()
  const pattern = `${prefix}%`
  await db.delete(collectionsTable).where(like(collectionsTable.entryId, pattern)).execute()
  await db.delete(entriesTable).where(like(entriesTable.id, pattern)).execute()
  await db.delete(subscriptionsTable).where(like(subscriptionsTable.id, pattern)).execute()
  await db.delete(feedsTable).where(like(feedsTable.id, pattern)).execute()
}

describePostgres.sequential("PostgreSQL entry query transport integration", () => {
  let handles: ReturnType<typeof createMainDBHandles>
  let baseUrl: string
  const ipc = new DbService()

  beforeAll(async () => {
    const parsedUrl = new URL(databaseUrl!)
    expect(parsedUrl.pathname.slice(1)).toMatch(/^suhui_performance_/)

    handles = createMainDBHandles({
      type: "postgres",
      config: { connectionString: databaseUrl },
    })
    activateMainDB(handles)
    databaseManager.getDB.mockImplementation(() => getMainDB())

    const db = getMainDB()
    const existingFixture = await db.query.subscriptionsTable.findFirst({
      where: (subscriptions, { like }) => like(subscriptions.title, "Fixture subscription %"),
      columns: { id: true },
    })
    expect(existingFixture).toBeDefined()

    await cleanupRows()
    await db.insert(feedsTable).values([
      { id: ids.feedA, title: "Transport A", url: `https://fixture.invalid/${ids.feedA}` },
      { id: ids.feedB, title: "Transport B", url: `https://fixture.invalid/${ids.feedB}` },
      {
        id: ids.inactiveFeed,
        title: "Transport inactive",
        url: `https://fixture.invalid/${ids.inactiveFeed}`,
      },
    ])
    await db.insert(subscriptionsTable).values([
      {
        id: `${prefix}subscription_feed_a`,
        feedId: ids.feedA,
        userId: `${prefix}user`,
        view: 0,
        isPrivate: false,
        hideFromTimeline: false,
        title: "Transport feed A",
        type: "feed",
      },
      {
        id: `${prefix}subscription_feed_b`,
        feedId: ids.feedB,
        userId: `${prefix}user`,
        view: 0,
        isPrivate: false,
        hideFromTimeline: false,
        title: "Transport feed B",
        type: "feed",
      },
      {
        id: `${prefix}subscription_list`,
        listId: ids.list,
        userId: `${prefix}user`,
        view: 1,
        isPrivate: false,
        hideFromTimeline: false,
        title: "Transport list",
        type: "list",
      },
      {
        id: `${prefix}subscription_inbox`,
        inboxId: ids.inbox,
        userId: `${prefix}user`,
        view: 2,
        isPrivate: false,
        hideFromTimeline: false,
        title: "Transport inbox",
        type: "inbox",
      },
    ])

    await db.insert(entriesTable).values([
      makeEntry(feedEntryIds[0]!, {
        feedId: ids.feedA,
        publishedAt: baseTime + 500,
        insertedAt: baseTime + 500,
      }),
      makeEntry(feedEntryIds[1]!, {
        feedId: ids.feedA,
        publishedAt: baseTime + 500,
        insertedAt: baseTime + 500,
      }),
      makeEntry(feedEntryIds[2]!, {
        feedId: ids.feedA,
        publishedAt: baseTime + 500,
        insertedAt: baseTime + 400,
      }),
      makeEntry(feedEntryIds[3]!, {
        feedId: ids.feedA,
        publishedAt: baseTime + 300,
        insertedAt: baseTime + 300,
      }),
      makeEntry(feedEntryIds[4]!, {
        feedId: ids.feedA,
        publishedAt: baseTime + 300,
        insertedAt: baseTime + 300,
      }),
      makeEntry(ids.nullReadEntry, {
        feedId: ids.feedB,
        read: null,
        publishedAt: baseTime + 900,
        insertedAt: baseTime + 900,
      }),
      makeEntry(ids.trueReadEntry, {
        feedId: ids.feedB,
        read: true,
        publishedAt: baseTime + 800,
        insertedAt: baseTime + 800,
      }),
      makeEntry(ids.listEntry, {
        sources: [ids.list],
        publishedAt: baseTime + 700,
        insertedAt: baseTime + 700,
      }),
      makeEntry(ids.inboxEntry, {
        inboxHandle: ids.inbox,
        publishedAt: baseTime + 600,
        insertedAt: baseTime + 600,
      }),
      makeEntry(ids.collectionEntry, {
        feedId: ids.feedA,
        publishedAt: baseTime + 200,
        insertedAt: baseTime + 200,
      }),
      makeEntry(ids.inactiveEntry, {
        feedId: ids.inactiveFeed,
        publishedAt: baseTime + 1_000,
        insertedAt: baseTime + 1_000,
      }),
    ])
    await db.insert(collectionsTable).values({
      entryId: ids.collectionEntry,
      feedId: ids.feedA,
      view: 3,
      createdAt: new Date().toISOString(),
    })

    const server = await RemoteServerManager.start({ host: "127.0.0.1", port: 0 })
    baseUrl = server.baseUrl
  }, 30_000)

  afterAll(async () => {
    await RemoteServerManager.stop()
    if (handles) {
      await cleanupRows()
      await closeMainDBHandles(handles)
    }
  }, 30_000)

  const ipcList = (query: EntryListQuery) => ipc.listEntries({} as never, query)
  const httpList = async (search: string): Promise<EntrySummaryPage> => {
    const response = await fetch(`${baseUrl}/api/entries${search}`)
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      data: EntrySummaryPage["items"]
      page: EntrySummaryPage["page"]
    }
    return { items: payload.data, page: payload.page }
  }

  it("executes deterministic first and second keyset pages without duplicates or omissions", async () => {
    const firstQuery = {
      scope: { kind: "feeds", feedIds: [ids.feedA] },
      limit: 3,
    } satisfies EntryListQuery
    const [first, firstHttp] = await Promise.all([
      ipcList(firstQuery),
      httpList(`?feedId=${ids.feedA}&limit=3`),
    ])
    expect(firstHttp).toEqual(first)
    expect(first.items.map((entry) => entry.id)).toEqual(feedEntryIds.slice(0, 3))
    expect(first.page).toMatchObject({ limit: 3, hasMore: true })
    expect(first.page.nextCursor).toEqual(expect.any(String))

    const secondQuery = {
      scope: { kind: "feeds", feedIds: [ids.feedA] },
      limit: 3,
      cursor: first.page.nextCursor!,
    } satisfies EntryListQuery
    const [second, secondHttp] = await Promise.all([
      ipcList(secondQuery),
      httpList(`?feedId=${ids.feedA}&limit=3&cursor=${encodeURIComponent(first.page.nextCursor!)}`),
    ])
    expect(secondHttp).toEqual(second)
    expect(second.items.map((entry) => entry.id)).toEqual([
      feedEntryIds[3],
      feedEntryIds[4],
      ids.collectionEntry,
    ])
    expect(second.page).toEqual({ limit: 3, hasMore: false, nextCursor: null })

    const combined = [...first.items, ...second.items]
    expect(first.items).toHaveLength(3)
    expect(second.items).toHaveLength(3)
    expect(new Set(combined.map((entry) => entry.id)).size).toBe(combined.length)
    for (const entry of combined) {
      expect(entry.recordKind).toBe("summary")
      expect(entry).not.toHaveProperty("content")
      expect(entry).not.toHaveProperty("readabilityContent")
      expect(entry).not.toHaveProperty("readabilityUpdatedAt")
    }
  })

  it.each([
    ["all", { scope: { kind: "timeline" }, limit: 20 } satisfies EntryListQuery, "?limit=20"],
    [
      "unread including NULL",
      { scope: { kind: "timeline" }, read: false, limit: 20 } satisfies EntryListQuery,
      "?unreadOnly=true&limit=20",
    ],
    [
      "multiple feeds",
      {
        scope: { kind: "feeds", feedIds: [ids.feedA, ids.feedB] },
        limit: 20,
      } satisfies EntryListQuery,
      `?feedId=${ids.feedA}&feedId=${ids.feedB}&limit=20`,
    ],
    [
      "list",
      { scope: { kind: "list", listId: ids.list }, limit: 20 } satisfies EntryListQuery,
      `?listId=${ids.list}&limit=20`,
    ],
    [
      "inbox",
      { scope: { kind: "inbox", inboxId: ids.inbox }, limit: 20 } satisfies EntryListQuery,
      `?inboxId=${ids.inbox}&limit=20`,
    ],
    [
      "collection",
      { scope: { kind: "collection", view: 3 }, limit: 20 } satisfies EntryListQuery,
      "?isCollection=true&view=3&limit=20",
    ],
  ])("keeps real PostgreSQL items/page parity for %s", async (_name, query, search) => {
    const [ipcPage, httpPage] = await Promise.all([ipcList(query), httpList(search)])
    expect(httpPage).toEqual(ipcPage)
    expect(httpPage.items.length).toBeLessThanOrEqual(httpPage.page.limit)
    for (const entry of httpPage.items) {
      expect(entry).not.toHaveProperty("content")
      expect(entry).not.toHaveProperty("readabilityContent")
      expect(entry).not.toHaveProperty("readabilityUpdatedAt")
    }
  })

  it("preserves NULL unread, multi-feed membership, and individual scope semantics", async () => {
    const unread = await ipcList({ scope: { kind: "timeline" }, read: false, limit: 20 })
    expect(unread.items.find((entry) => entry.id === ids.nullReadEntry)).toMatchObject({
      read: false,
    })
    expect(unread.items.some((entry) => entry.id === ids.trueReadEntry)).toBe(false)

    const multiFeed = await ipcList({
      scope: { kind: "feeds", feedIds: [ids.feedA, ids.feedB] },
      limit: 20,
    })
    expect(multiFeed.items.map((entry) => entry.id)).toContain(ids.nullReadEntry)
    expect(multiFeed.items.every((entry) => [ids.feedA, ids.feedB].includes(entry.feedId!))).toBe(
      true,
    )

    await expect(ipcList({ scope: { kind: "list", listId: ids.list } })).resolves.toMatchObject({
      items: [{ id: ids.listEntry }],
    })
    await expect(ipcList({ scope: { kind: "inbox", inboxId: ids.inbox } })).resolves.toMatchObject({
      items: [{ id: ids.inboxEntry }],
    })
    await expect(ipcList({ scope: { kind: "collection", view: 3 } })).resolves.toMatchObject({
      items: [{ id: ids.collectionEntry }],
    })
  })

  it("keeps Desktop detail broad and Remote detail limited to active relations", async () => {
    const desktopActive = await ipc.getEntry({} as never, feedEntryIds[0]!)
    const desktopInactive = await ipc.getEntry({} as never, ids.inactiveEntry)
    expect(desktopActive).toMatchObject({ recordKind: "detail", content: expect.any(String) })
    expect(desktopInactive).toMatchObject({ id: ids.inactiveEntry, recordKind: "detail" })

    const activeResponse = await fetch(`${baseUrl}/api/entries/${feedEntryIds[0]}`)
    const inactiveResponse = await fetch(`${baseUrl}/api/entries/${ids.inactiveEntry}`)
    await expect(activeResponse.json()).resolves.toMatchObject({
      data: { id: feedEntryIds[0], recordKind: "detail", content: expect.any(String) },
    })
    await expect(inactiveResponse.json()).resolves.toEqual({ data: null })
  })

  it("rejects conflicting HTTP scopes before executing an alternate query path", async () => {
    const response = await fetch(
      `${baseUrl}/api/entries?feedId=${ids.feedA}&listId=${ids.list}&limit=20`,
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SUHUI_INVALID_ENTRY_SCOPE" },
    })
  })
})
