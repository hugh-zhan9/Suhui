import { beforeEach, describe, expect, it, vi } from "vitest"

import { AnnotationApplicationService } from "./service"

const {
  getEntryMany,
  getHighlights,
  upsertHighlight,
  upsertNote,
  runTrackedOperation,
  listLibrary,
} = vi.hoisted(() => ({
  getEntryMany: vi.fn(),
  getHighlights: vi.fn(),
  upsertHighlight: vi.fn(),
  upsertNote: vi.fn(),
  listLibrary: vi.fn(),
  runTrackedOperation: vi.fn((operation: () => Promise<unknown>) => operation()),
}))

vi.mock("@suhui/database/services/entry", () => ({ EntryService: { getEntryMany } }))
vi.mock("@suhui/database/services/entry-annotation", () => ({
  EntryAnnotationService: {
    getNotes: vi.fn(),
    getHighlights,
    upsertHighlight,
    upsertNote,
    listLibrary,
  },
}))
vi.mock("~/manager/db", () => ({
  DBManager: { runTrackedOperation },
}))

describe("AnnotationApplicationService library", () => {
  beforeEach(() => vi.clearAllMocks())

  it("uses a bounded default and forwards a typed cursor", async () => {
    listLibrary.mockResolvedValue({ items: [], nextCursor: null })
    const service = new AnnotationApplicationService()
    await service.listLibrary()
    expect(listLibrary).toHaveBeenLastCalledWith({ limit: 50 })
    const input = {
      kind: "note" as const,
      cursor: { updatedAt: 12, id: "n1", kind: "note" as const },
      limit: 100,
    }
    await service.listLibrary(input)
    expect(listLibrary).toHaveBeenLastCalledWith(input)
  })

  it.each([0, -1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid page size %s before querying",
    (limit) => {
      expect(() => new AnnotationApplicationService().listLibrary({ limit })).toThrow("page size")
      expect(listLibrary).not.toHaveBeenCalled()
    },
  )

  it("rejects malformed filters and cursors", () => {
    const service = new AnnotationApplicationService()
    expect(() => service.listLibrary({ kind: "invalid" as never })).toThrow("kind")
    expect(() => service.listLibrary({ cursor: { id: "", updatedAt: 1, kind: "note" } })).toThrow(
      "cursor",
    )
    expect(() =>
      service.listLibrary({ cursor: { id: "n1", updatedAt: Number.NaN, kind: "note" } }),
    ).toThrow("cursor")
    expect(listLibrary).not.toHaveBeenCalled()
  })
})

describe("AnnotationApplicationService relocation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("registers annotation mutations with the maintenance barrier", async () => {
    getEntryMany.mockResolvedValue([{ id: "entry-1" }])
    const service = new AnnotationApplicationService()

    await service.createNote("entry-1", "note")

    expect(runTrackedOperation).toHaveBeenCalledOnce()
  })

  it("marks highlights orphaned when their source disappeared and continues other sources", async () => {
    getEntryMany.mockResolvedValue([
      { id: "entry-1", content: null, readabilityContent: "<p>kept quote here</p>" },
    ])
    getHighlights.mockResolvedValue([
      {
        id: "rss-highlight",
        entryId: "entry-1",
        source: "rss",
        quote: "old quote",
        prefix: "",
        suffix: "",
        startOffset: 0,
        endOffset: 9,
        status: "active",
      },
      {
        id: "readability-highlight",
        entryId: "entry-1",
        source: "readability",
        quote: "kept quote",
        prefix: "",
        suffix: " here",
        startOffset: null,
        endOffset: null,
        status: "orphaned",
      },
    ])

    const result = await new AnnotationApplicationService().relocate("entry-1")

    expect(result[0]).toMatchObject({
      id: "rss-highlight",
      status: "orphaned",
      startOffset: null,
      endOffset: null,
    })
    expect(result[1]).toMatchObject({ id: "readability-highlight", status: "active" })
    expect(upsertHighlight).toHaveBeenCalledTimes(2)
  })
})
