import { describe, expect, it, vi } from "vitest"

vi.mock("~/manager/feed-refresh", () => ({ FeedRefreshService: { buildPreviewData: vi.fn() } }))
vi.mock("~/manager/db", () => ({ DBManager: {} }))
vi.mock("../local-reading/pipeline", () => ({ localReadingPipeline: {} }))

import { FeedRepairService, getRepairPages, selectMissingRepairEntries } from "./repair-service"

const feed = {
  id: "saved",
  url: "https://example.com/atom.xml",
  siteUrl: "https://example.com/blog/",
}
const previewResult = {
  feed: { id: "saved", url: "https://example.com/rss.xml" },
  entries: [{ id: "new" }],
} as any
const setup = () => {
  const preview = vi.fn().mockResolvedValue(previewResult)
  const save = vi.fn().mockResolvedValue({ added: 1 })
  return {
    preview,
    save,
    service: new FeedRepairService({
      read: vi.fn().mockResolvedValue(feed),
      preview,
      save,
      track: (task) => task(),
    }),
  }
}

describe("explicit feed source repair", () => {
  it("keeps blog subdomains and paths, falling back to the site's root", () => {
    expect(getRepairPages({ ...feed, siteUrl: "https://blog.example.com/posts/" })).toEqual([
      "https://blog.example.com/posts/",
      "https://blog.example.com/",
    ])
    expect(getRepairPages({ ...feed, siteUrl: null })).toEqual(["https://example.com/"])
    expect(() => getRepairPages({ ...feed, url: "rsshub://bilibili/user/1" })).toThrow("RSSHub")
  })
  it("discovers a validated RSS with the saved ID and coalesces concurrent repairs", async () => {
    const { service, preview, save } = setup()
    const first = service.repair("saved")
    expect(service.repair("saved")).toBe(first)
    expect(await first).toMatchObject({
      feedId: "saved",
      previousUrl: feed.url,
      url: previewResult.feed.url,
      added: 1,
    })
    expect(preview).toHaveBeenCalledWith(feed.siteUrl, "saved", false, false, {
      allowScraping: false,
    })
    expect(save).toHaveBeenCalledTimes(1)
  })
  it("tries the root if the saved site path is gone", async () => {
    const { service, preview } = setup()
    preview.mockRejectedValueOnce(new Error("HTTP 404"))
    await service.repair("saved")
    expect(preview).toHaveBeenLastCalledWith("https://example.com/", "saved", false, false, {
      allowScraping: false,
    })
  })
  it("does not save empty feeds or generated pages, and permits retry after failure", async () => {
    const { service, preview, save } = setup()
    preview.mockResolvedValue({ ...previewResult, entries: [] })
    await expect(service.repair("saved")).rejects.toThrow("原订阅保持不变")
    preview.mockResolvedValue({
      ...previewResult,
      feed: { url: "sitescrape:https://example.com/" },
    })
    await expect(service.repair("saved")).rejects.toThrow("原订阅保持不变")
    expect(save).not.toHaveBeenCalled()
    preview.mockResolvedValue(previewResult)
    await service.repair("saved")
    expect(save).toHaveBeenCalledOnce()
  })
  it("keeps existing read articles and tombstones when RSS/Atom changes GUID", () => {
    const existing = [
      { id: "read", url: "https://example.com/1/", guid: "old", read: true },
      { id: "deleted", url: "https://example.com/2" },
    ]
    const incoming = [
      { id: "changed-guid", url: "https://example.com/1", guid: "new" },
      { id: "resurrect", url: "https://example.com/2" },
      { id: "new", url: "https://example.com/3" },
    ]
    expect(selectMissingRepairEntries(existing, incoming as any)).toEqual([incoming[2]])
    expect(existing[0]!.read).toBe(true)
  })
})
