import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@suhui/database/services/entry", () => ({
  EntryService: {
    getEntriesToHydrate: vi.fn(async () => []),
    patch: vi.fn(),
    patchMany: vi.fn(),
    upsertMany: vi.fn(),
  },
}))

const { entryActions, entrySyncServices, useEntryStore } = await import("./store")
const { getEntry } = await import("./getter")
const { resetHydratePhases, startHydrateInteractive } = await import("../../hydrate-phases")

const entry = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "e1",
    title: "title",
    url: "https://example.com/e1",
    description: "description",
    guid: "guid-e1",
    author: null,
    authorUrl: null,
    authorAvatar: null,
    insertedAt: 20,
    publishedAt: 10,
    media: null,
    categories: null,
    attachments: null,
    language: null,
    feedId: "f1",
    inboxHandle: null,
    read: false,
    sources: null,
    content: null,
    readabilityContent: null,
    readabilityUpdatedAt: null,
    extra: null,
    settings: null,
    ...overrides,
  }) as any

describe("entry projection merges", () => {
  beforeEach(() => {
    resetHydratePhases()
    useEntryStore.setState({
      data: {},
      entryIdByView: {} as any,
      entryIdByCategory: {},
      entryIdByFeed: {},
      entryIdByInbox: {},
      entryIdByList: {},
      entryIdSet: new Set(),
      detailLoadedEntryIds: new Set(),
    } as any)
  })

  it("does not erase detail when a summary arrives later", () => {
    expect(entryActions).toHaveProperty("upsertDetails")
    expect(entryActions).toHaveProperty("upsertSummaries")
    ;(entryActions as any).upsertDetails([entry({ recordKind: "detail", content: "body" })])
    ;(entryActions as any).upsertSummaries([
      entry({ recordKind: "summary", title: "new title", content: undefined }),
    ])

    expect(getEntry("e1")).toMatchObject({ title: "new title", content: "body" })
    expect((entryActions as any).isDetailLoaded("e1")).toBe(true)
  })

  it("marks an empty body detail loaded and does not fetch it again", async () => {
    expect(entryActions).toHaveProperty("upsertDetails")
    ;(entryActions as any).upsertDetails([
      entry({ recordKind: "detail", content: "", readabilityContent: null }),
    ])

    const getDetail = vi.spyOn((await import("../../runtime")).runtimeClient.entries, "getDetail")
    await entrySyncServices.fetchEntryDetail("e1")

    expect((entryActions as any).isDetailLoaded("e1")).toBe(true)
    expect(getDetail).not.toHaveBeenCalled()
  })

  it("preserves the current optimistic read state when a stale summary arrives", () => {
    expect(entryActions).toHaveProperty("upsertSummaries")
    ;(entryActions as any).upsertSummaries([entry({ recordKind: "summary", read: false })])
    entryActions.markEntryReadStatusInSession({ entryIds: ["e1"], read: true })
    ;(entryActions as any).upsertSummaries([entry({ recordKind: "summary", read: false })])

    expect(getEntry("e1")?.read).toBe(true)
  })

  it("restores summary snapshots without suppressing detail fetch and preserves dirty reads", async () => {
    startHydrateInteractive("projection-test")
    entryActions.upsertSummaries([entry({ recordKind: "summary", read: false })])
    entryActions.markEntryReadStatusInSession({ entryIds: ["e1"], read: true })
    entryActions.restoreHydratedSnapshotInSession([
      entry({ recordKind: "summary", read: false, content: undefined }),
    ])

    expect(getEntry("e1")).toMatchObject({ read: true, recordKind: "summary" })
    expect(entryActions.isDetailLoaded("e1")).toBe(false)

    const detail = entry({ recordKind: "detail", read: false, content: "restored body" })
    const getDetail = vi
      .spyOn((await import("../../runtime")).runtimeClient.entries, "getDetail")
      .mockResolvedValueOnce(detail)

    await expect(entrySyncServices.fetchEntryDetail("e1")).resolves.toEqual(detail)
    expect(getDetail).toHaveBeenCalledWith("e1")
    expect(getEntry("e1")).toMatchObject({
      content: "restored body",
      read: true,
      recordKind: "detail",
    })
    expect(entryActions.isDetailLoaded("e1")).toBe(true)
  })
})
