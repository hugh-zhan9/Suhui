import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getEntryAll,
  getEntryMany,
  getMembersByFingerprint,
  getMembersByEntryIds,
  getExclusions,
  removeMembers,
  getClustersByIds,
  getCluster,
  setManualRepresentative,
  excludeMember,
  upsertCluster,
  upsertMembers,
  getDB,
  getPgPool,
  runTrackedOperation,
} = vi.hoisted(() => ({
  getEntryAll: vi.fn(),
  getEntryMany: vi.fn(),
  getMembersByFingerprint: vi.fn(),
  getMembersByEntryIds: vi.fn(),
  getExclusions: vi.fn(),
  removeMembers: vi.fn(),
  getClustersByIds: vi.fn(),
  getCluster: vi.fn(),
  setManualRepresentative: vi.fn(),
  excludeMember: vi.fn(),
  upsertCluster: vi.fn(),
  upsertMembers: vi.fn(),
  getDB: vi.fn(),
  getPgPool: vi.fn(),
  runTrackedOperation: vi.fn((operation: () => Promise<unknown>) => operation()),
}))

vi.mock("@suhui/database/services/entry", () => ({
  EntryService: { getEntryAll, getEntryMany },
}))

vi.mock("@suhui/database/services/content-cluster", () => ({
  ContentClusterService: {
    getMembersByFingerprint,
    getMembersByEntryIds,
    getExclusions,
    removeMembers,
    getClustersByIds,
    getCluster,
    setManualRepresentative,
    excludeMember,
    upsertCluster,
    upsertMembers,
  },
}))

vi.mock("~/manager/db", () => ({ DBManager: { getDB, getPgPool, runTrackedOperation } }))

import { DedupApplicationService } from "./service"

describe("DedupApplicationService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMembersByEntryIds.mockResolvedValue([])
    getExclusions.mockResolvedValue([])
    getMembersByFingerprint.mockResolvedValue([])
    getDB.mockReturnValue({ query: { entriesTable: { findMany: vi.fn() } } })
    getPgPool.mockReturnValue({
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ after_entry_id: null, processed: 0, clustered: 0 }] })
        .mockResolvedValue({ rows: [] }),
    })
    getClustersByIds.mockResolvedValue([])
    getCluster.mockResolvedValue(null)
  })

  it("moves a previously unclustered canonical match into the shared cluster", async () => {
    const previous = {
      id: "entry-old",
      feedId: "feed-old",
      url: "https://example.com/story?utm_source=old",
      publishedAt: 100,
    }
    const current = {
      id: "entry-new",
      feedId: "feed-new",
      url: "https://example.com/story",
      publishedAt: 200,
    }
    getEntryMany.mockImplementation(async (ids: string[]) =>
      ids.includes("entry-new") ? [current] : [previous],
    )
    getMembersByFingerprint.mockResolvedValue([
      { entryId: "entry-old", clusterId: "old-singleton" },
    ])

    await new DedupApplicationService().processEntries(["entry-new"])

    expect(upsertMembers).toHaveBeenCalledWith([
      expect.objectContaining({ entryId: "entry-old", clusterId: "old-singleton" }),
      expect.objectContaining({ entryId: "entry-new", clusterId: "old-singleton" }),
    ])
  })

  it("keeps a manual representative when a full rebuild scans entries in reverse order", async () => {
    const first = {
      id: "entry-a",
      feedId: "feed-a",
      url: "https://example.com/shared",
      publishedAt: 100,
    }
    const second = { ...first, id: "entry-b", feedId: "feed-b", publishedAt: 200 }
    const rebuildFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: "entry-b" }, { id: "entry-a" }])
      .mockResolvedValueOnce([])
    getDB.mockReturnValue({ query: { entriesTable: { findMany: rebuildFindMany } } })
    getEntryMany.mockImplementation(async (ids: string[]) =>
      ids.length === 2 ? [second, first] : ids[0] === "entry-a" ? [first] : [second],
    )
    getClustersByIds.mockResolvedValue([
      { id: "legacy-cluster", manualRepresentativeEntryId: "entry-a" },
    ])
    getMembersByEntryIds
      .mockResolvedValueOnce([
        { entryId: "entry-a", clusterId: "legacy-cluster" },
        { entryId: "entry-b", clusterId: "legacy-cluster" },
      ])
      .mockResolvedValueOnce([{ entryId: "entry-a", clusterId: "rebuilt-cluster" }])
    let sharedClusterId = ""
    getMembersByFingerprint.mockImplementation(async () =>
      sharedClusterId ? [{ entryId: "entry-b", clusterId: sharedClusterId }] : [],
    )
    upsertMembers.mockImplementation(async (members) => {
      sharedClusterId = members.at(-1).clusterId
    })
    await new DedupApplicationService().rebuild()

    expect(removeMembers).toHaveBeenCalledWith(["entry-b", "entry-a"])
    expect(setManualRepresentative).toHaveBeenCalledWith(
      "rebuilt-cluster",
      "entry-a",
      expect.any(Number),
    )
    const clusterIds = upsertCluster.mock.calls.map(([cluster]) => cluster.id)
    expect(new Set(clusterIds)).toHaveLength(1)
  })

  it("persists a split exclusion so rebuild cannot immediately regroup the member", async () => {
    getMembersByEntryIds.mockResolvedValue([
      { entryId: "entry-a", clusterId: "cluster-1", fingerprint: "fingerprint-1" },
    ])

    await new DedupApplicationService().splitMember("cluster-1", "entry-a")

    expect(excludeMember).toHaveBeenCalledWith("entry-a", "fingerprint-1", expect.any(Number))
  })

  it("does not regroup an excluded member during processing", async () => {
    getEntryMany.mockResolvedValue([
      {
        id: "entry-a",
        feedId: "feed-a",
        url: "https://example.com/shared",
        publishedAt: 100,
      },
    ])
    getExclusions.mockResolvedValue([
      { entryId: "entry-a", fingerprint: "previous-text-fingerprint" },
    ])

    const result = await new DedupApplicationService().processEntries(["entry-a"])

    expect(result).toEqual({ processed: 1, clustered: 0 })
    expect(upsertMembers).not.toHaveBeenCalled()
  })

  it("resumes a failed batch from its durable manual-representative checkpoint", async () => {
    const entry = {
      id: "entry-a",
      feedId: "feed-a",
      url: "https://example.com/a",
      publishedAt: 100,
    }
    let checkpointIds: string[] = []
    let checkpointManualIds: string[] = []
    const poolQuery = vi.fn(async (statement: string, parameters?: unknown[]) => {
      if (statement.includes("SELECT after_entry_id")) {
        return {
          rows: [
            {
              after_entry_id: null,
              batch_entry_ids: checkpointIds,
              manual_entry_ids: checkpointManualIds,
              processed: 0,
              clustered: 0,
            },
          ],
        }
      }
      if (statement.includes("SET batch_entry_ids = $1")) {
        checkpointIds = JSON.parse(parameters?.[0] as string)
        checkpointManualIds = JSON.parse(parameters?.[1] as string)
      }
      if (statement.includes("SET after_entry_id = $1")) {
        checkpointIds = []
        checkpointManualIds = []
      }
      return { rows: [] }
    })
    getPgPool.mockReturnValue({ query: poolQuery })
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: entry.id }])
      .mockResolvedValueOnce([])
    getDB.mockReturnValue({ query: { entriesTable: { findMany } } })
    getMembersByEntryIds
      .mockResolvedValueOnce([{ entryId: entry.id, clusterId: "legacy" }])
      .mockResolvedValueOnce([{ entryId: entry.id, clusterId: "rebuilt" }])
    getClustersByIds.mockResolvedValue([{ id: "legacy", manualRepresentativeEntryId: entry.id }])
    getEntryMany
      .mockRejectedValueOnce(new Error("injected batch failure"))
      .mockResolvedValue([entry])

    const service = new DedupApplicationService()
    await expect(service.rebuild()).rejects.toThrow("injected batch failure")
    expect(checkpointIds).toEqual([entry.id])
    expect(checkpointManualIds).toEqual([entry.id])

    await expect(service.rebuild()).resolves.toMatchObject({ processed: 1 })
    expect(setManualRepresentative).toHaveBeenCalledWith("rebuilt", entry.id, expect.any(Number))
    expect(checkpointIds).toEqual([])
  })

  it("serializes a representative change behind an in-progress rebuild", async () => {
    let releaseEntries!: () => void
    const entriesGate = new Promise<void>((resolve) => {
      releaseEntries = resolve
    })
    const findMany = vi.fn(async () => {
      await entriesGate
      return []
    })
    getDB.mockReturnValue({ query: { entriesTable: { findMany } } })
    getCluster.mockResolvedValue({ id: "cluster-1", manualRepresentativeEntryId: null })
    getMembersByEntryIds.mockResolvedValue([{ entryId: "entry-b", clusterId: "cluster-1" }])

    const service = new DedupApplicationService()
    const rebuild = service.rebuild()
    await vi.waitFor(() => expect(findMany).toHaveBeenCalled())
    const setRepresentativeResult = service.setRepresentative("cluster-1", "entry-b")

    expect(setManualRepresentative).not.toHaveBeenCalled()
    releaseEntries()
    await rebuild
    await setRepresentativeResult

    expect(setManualRepresentative).toHaveBeenLastCalledWith(
      "cluster-1",
      "entry-b",
      expect.any(Number),
    )
  })

  it("serializes a split behind an in-progress rebuild", async () => {
    let releaseEntries!: () => void
    const entriesGate = new Promise<void>((resolve) => {
      releaseEntries = resolve
    })
    const findMany = vi.fn(async () => {
      await entriesGate
      return []
    })
    getDB.mockReturnValue({ query: { entriesTable: { findMany } } })
    getMembersByEntryIds.mockResolvedValue([
      { entryId: "entry-a", clusterId: "cluster-1", fingerprint: "fingerprint-1" },
    ])

    const service = new DedupApplicationService()
    const rebuild = service.rebuild()
    await vi.waitFor(() => expect(findMany).toHaveBeenCalled())
    const split = service.splitMember("cluster-1", "entry-a")

    expect(excludeMember).not.toHaveBeenCalled()
    releaseEntries()
    await rebuild
    await split

    expect(excludeMember).toHaveBeenCalledWith("entry-a", "fingerprint-1", expect.any(Number))
  })
})
