import { describe, expect, it, vi } from "vitest"

vi.mock("../subscription/service", () => ({ subscriptionApplicationService: {} }))
vi.mock("@suhui/database/services/feed", () => ({ FeedService: {} }))
vi.mock("~/manager/db", () => ({
  DBManager: { runTrackedOperation: (operation: () => Promise<unknown>) => operation() },
}))

import { OpmlApplicationService } from "./service"

const xml = `<?xml version="1.0"?><opml version="2.0"><body>
  <outline type="rss" text="Existing" xmlUrl="https://example.com/feed/"/>
  <outline type="rss" text="Duplicate" xmlUrl="https://example.com/feed"/>
  <outline type="rss" text="New" xmlUrl="https://new.example/feed"/>
</body></opml>`

describe("OpmlApplicationService", () => {
  it("previews and imports only selected non-duplicate subscriptions", async () => {
    const create = vi.fn()
    const service = new OpmlApplicationService({
      list: async () => [
        { url: "https://example.com/feed", title: null, category: null, htmlUrl: null },
      ],
      create,
    })

    const preview = await service.preview(xml)
    const result = await service.import(xml, [0, 1, 2])

    expect(preview.map((item) => item.duplicate)).toEqual([true, true, false])
    expect(result).toEqual({ imported: 1, skipped: 2, total: 3 })
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]![0].title).toBe("New")
  })
})
