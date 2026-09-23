import { EntryService } from "@suhui/database/services/entry"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@suhui/database/services/entry", () => ({ EntryService: { patch: vi.fn() } }))

const { entryActions, entrySyncServices, useEntryStore } = await import("./store")
const { getEntry } = await import("./getter")

beforeEach(() => {
  vi.mocked(EntryService.patch).mockReset()
  useEntryStore.setState({
    data: {
      e1: {
        id: "e1",
        url: "https://example.com/1",
        content: "RSS",
        readabilityContent: null,
      } as any,
    },
  })
})

describe("readability persistence", () => {
  it("waits for the database before exposing newly fetched text", async () => {
    let finish!: () => void
    const write = new Promise<void>((resolve) => {
      finish = resolve
    })
    vi.mocked(EntryService.patch).mockReturnValue(write)
    const completed = vi.fn()
    const request = entrySyncServices
      .fetchEntryReadabilityContent("e1", async () => "Full text")
      .then(completed)
    await vi.waitFor(() => expect(EntryService.patch).toHaveBeenCalledOnce())
    expect(completed).not.toHaveBeenCalled()
    expect(getEntry("e1")?.readabilityContent).toBeNull()
    finish()
    await request
    expect(getEntry("e1")?.readabilityContent).toBe("Full text")
    expect(completed).toHaveBeenCalledOnce()
  })

  it("propagates a failed write without caching unpersisted text; an explicit retry fetches again", async () => {
    const error = new Error("write failed")
    vi.mocked(EntryService.patch).mockRejectedValueOnce(error).mockResolvedValueOnce(undefined)
    const resolveContent = vi.fn().mockResolvedValue("Full text")
    await expect(entrySyncServices.fetchEntryReadabilityContent("e1", resolveContent)).rejects.toBe(
      error,
    )
    expect(getEntry("e1")?.readabilityContent).toBeNull()
    await entrySyncServices.fetchEntryReadabilityContent("e1", resolveContent)
    expect(resolveContent).toHaveBeenCalledTimes(2)
    expect(getEntry("e1")?.readabilityContent).toBe("Full text")
  })

  it("writes RSS and readability content together before updating the store", async () => {
    await entryActions.updateEntryContent({
      entryId: "e1",
      content: "Updated RSS",
      readabilityContent: "Full text",
      readabilityUpdatedAt: 123,
    })
    expect(EntryService.patch).toHaveBeenCalledExactlyOnceWith({
      id: "e1",
      content: "Updated RSS",
      readabilityContent: "Full text",
      readabilityUpdatedAt: 123,
    })
    expect(getEntry("e1")).toMatchObject({
      content: "Updated RSS",
      readabilityContent: "Full text",
      readabilityUpdatedAt: 123,
    })
  })

  it("does not write empty content or a timestamp without readability", async () => {
    await entryActions.updateEntryContent({ entryId: "e1", content: "", readabilityContent: "" })
    expect(EntryService.patch).not.toHaveBeenCalled()
    await entryActions.updateEntryContent({ entryId: "e1", content: "Updated RSS" })
    expect(EntryService.patch).toHaveBeenCalledExactlyOnceWith({ id: "e1", content: "Updated RSS" })
  })
})
