import { describe, expect, it, vi } from "vitest"

import { FeedHistoryService } from "./history-service"

vi.mock("~/manager/db", () => ({ DBManager: {} }))
vi.mock("../local-reading/pipeline", () => ({
  localReadingPipeline: { processNewEntries: vi.fn() },
}))

const origin = "https://blog.test"
const listing = (ids: number[], next?: string) =>
  `<main>${ids.map((id) => `<article><h2><a href="/article-${id}/">历史文章标题 ${id}</a></h2><time datetime="2025-01-01">date</time></article>`).join("")}</main>${next ? `<a rel="next" href="${next}">下一页</a>` : ""}`

const setup = (pages: Record<string, string>, initial = [1, 2, 3]) => {
  const stored = new Set(initial.map((id) => `${origin}/article-${id}`))
  const inserted: Array<{ url: string; content: string }>[] = []
  const fetchPage = vi.fn(async (url: string) => ({
    url,
    html: pages[url] ?? "<article>完整正文</article>",
  }))
  const deps = {
    readFeed: async () => ({ url: `${origin}/feed.xml`, siteUrl: `${origin}/` }),
    readUrls: async () => [...stored],
    fetchPage,
    extractContent: () => "<p>完整正文</p>",
    database: () => "db-1",
    track: <T>(task: () => Promise<T>) => task(),
    insert: vi.fn(
      async (_id: string, _feed: unknown, articles: Array<{ url: string; content: string }>) => {
        inserted.push(articles)
        for (const article of articles) stored.add(article.url.replace(/\/$/, ""))
        return articles.length
      },
    ),
  }
  return { service: new FeedHistoryService(deps), deps, inserted, stored, fetchPage }
}

describe("history batches", () => {
  it("skips existing RSS articles, splits 11 missing articles into 10 + 1, and ends", async () => {
    const { service, inserted, fetchPage } = setup({
      [`${origin}/`]: listing([1, 2, 3, 4, 5], "/page/2/"),
      [`${origin}/page/2/`]: listing([6, 7, 8, 9, 10, 11, 12, 13, 14]),
    })
    expect(await service.loadMore("f1")).toMatchObject({ added: 10, hasMore: true })
    expect(await service.loadMore("f1")).toMatchObject({
      added: 1,
      hasMore: false,
      status: "complete",
    })
    const count = fetchPage.mock.calls.length
    expect(await service.loadMore("f1")).toMatchObject({ added: 0, status: "complete" })
    expect(fetchPage).toHaveBeenCalledTimes(count)
    expect(inserted.flat()).toHaveLength(11)
    expect(fetchPage).not.toHaveBeenCalledWith(`${origin}/article-1/`, origin)
  })

  it("coalesces concurrent requests for the same feed", async () => {
    const { service, deps } = setup({ [`${origin}/`]: listing([4, 5, 6]) })
    const first = service.loadMore("f1")
    expect(service.loadMore("f1")).toBe(first)
    await first
    expect(deps.insert).toHaveBeenCalledTimes(1)
  })

  it("does not commit or advance a failed batch; explicit repeat can succeed", async () => {
    const { service, deps, fetchPage } = setup({ [`${origin}/`]: listing([4, 5, 6]) })
    fetchPage.mockRejectedValueOnce(new Error("network failed"))
    await expect(service.loadMore("f1")).rejects.toThrow("network failed")
    expect(deps.insert).not.toHaveBeenCalled()
    expect(await service.loadMore("f1")).toMatchObject({ added: 3, status: "complete" })
  })

  it("keeps previous successful batches when a later article extraction fails", async () => {
    const { service, deps, inserted } = setup({
      [`${origin}/`]: listing(Array.from({ length: 14 }, (_, i) => i + 1)),
    })
    await service.loadMore("f1")
    deps.extractContent = () => {
      throw new Error("broken body")
    }
    // A new service models restart: scan again, skip persisted URLs, and fail only the missing tail.
    await expect(new FeedHistoryService(deps).loadMore("f1")).rejects.toThrow("broken body")
    expect(inserted.flat()).toHaveLength(10)
  })

  it("stops a cyclic pagination graph and reports unsupported empty pages", async () => {
    const { service, fetchPage } = setup({
      [`${origin}/`]: listing([1, 2, 3], "/page/2/"),
      [`${origin}/page/2/`]: listing([1, 2, 3], "/"),
    })
    expect(await service.loadMore("f1")).toMatchObject({ added: 0, status: "complete" })
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(
      await setup({ [`${origin}/`]: "<nav>nothing</nav>" }).service.loadMore("f1"),
    ).toMatchObject({ added: 0, status: "unsupported" })
  })

  it("continues through duplicate-only pages within a bounded scan batch", async () => {
    const pages = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        i === 0 ? `${origin}/` : `${origin}/page/${i}/`,
        listing([1, 2, 3], i < 5 ? `/page/${i + 1}/` : undefined),
      ]),
    )
    const { service } = setup(pages)
    expect(await service.loadMore("f1")).toMatchObject({ added: 0, hasMore: true, scannedPages: 4 })
    expect(await service.loadMore("f1")).toMatchObject({
      added: 0,
      hasMore: false,
      scannedPages: 6,
    })
  })
})

it("stops at the 100-page session limit even if a site always returns another page", async () => {
  const pages = Object.fromEntries(
    Array.from({ length: 101 }, (_, i) => [
      i === 0 ? `${origin}/` : `${origin}/page/${i}/`,
      listing([1, 2, 3], `/page/${i + 1}/`),
    ]),
  )
  const { service, fetchPage } = setup(pages)
  for (let i = 0; i < 24; i++) expect((await service.loadMore("f1")).status).toBe("more")
  expect(await service.loadMore("f1")).toMatchObject({
    status: "limit",
    hasMore: false,
    scannedPages: 100,
  })
  expect((await service.loadMore("f1")).status).toBe("limit")
  expect(fetchPage).toHaveBeenCalledTimes(100)
})

it("discards completed scan state when the active database changes", async () => {
  const { deps, fetchPage } = setup({ [`${origin}/`]: listing([1, 2, 3]) })
  let database = "a"
  const service = new FeedHistoryService({ ...deps, database: () => database })
  await service.loadMore("f1")
  database = "b"
  await service.loadMore("f1")
  expect(fetchPage).toHaveBeenCalledTimes(2)
})
