import { beforeEach, describe, expect, it, vi } from "vitest"

const { getEntryMany, getHighlights, upsertHighlight, upsertNote, runTrackedOperation } =
  vi.hoisted(() => ({
    getEntryMany: vi.fn(),
    getHighlights: vi.fn(),
    upsertHighlight: vi.fn(),
    upsertNote: vi.fn(),
    runTrackedOperation: vi.fn((operation: () => Promise<unknown>) => operation()),
  }))

vi.mock("@suhui/database/services/entry", () => ({ EntryService: { getEntryMany } }))
vi.mock("@suhui/database/services/entry-annotation", () => ({
  EntryAnnotationService: {
    getNotes: vi.fn(),
    getHighlights,
    upsertHighlight,
    upsertNote,
  },
}))
vi.mock("~/manager/db", () => ({
  DBManager: { runTrackedOperation },
}))

import { AnnotationApplicationService } from "./service"

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
