import { EntryService } from "@suhui/database/services/entry"
import { EntryAnnotationService } from "@suhui/database/services/entry-annotation"
import { EntryRuleService } from "@suhui/database/services/entry-rule"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { searchActions, useSearchStore } from "."
import { EntrySearchIndex } from "./entry-index"
import { SearchWorkerClient } from "./worker-client"

vi.mock("./worker-client", () => ({ SearchWorkerClient: vi.fn() }))
import { SearchType } from "./constants"

describe("local article search", () => {
  beforeEach(() => {
    searchActions.reset()
    searchActions.setSearchType(SearchType.Entry)
    searchActions.setSearchScope("all")
    vi.mocked(SearchWorkerClient).mockImplementation(() => {
      const index = new EntrySearchIndex()
      return {
        add: vi.fn(async (docs) => index.add(docs)),
        search: vi.fn(async (keyword, scope, activeIds) => index.search(keyword, scope, activeIds)),
        dispose: vi.fn(),
      } as unknown as SearchWorkerClient
    })
    vi.spyOn(EntryService, "getEntryAll")
    vi.spyOn(EntryService, "getSearchCount").mockResolvedValue(1)
    vi.spyOn(EntryService, "getSearchPage")
      .mockResolvedValue([])
      .mockResolvedValueOnce([
        {
          id: "article-1",
          feedId: "feed-1",
          title: "Lynan&#39;s Page",
          content: `<p>${"开头内容。".repeat(200)}文章末尾的独特关键词</p>`,
          description: "摘要内容",
          publishedAt: 0,
          insertedAt: 0,
        } as Awaited<ReturnType<typeof EntryService.getEntryAll>>[number],
      ])
    vi.spyOn(FeedService, "getFeedAll").mockResolvedValue([
      { id: "feed-1", title: "Lynan&#39;s Page" } as Awaited<
        ReturnType<typeof FeedService.getFeedAll>
      >[number],
    ])
    vi.spyOn(SubscriptionService, "getSubscriptionAll").mockResolvedValue([
      { id: "feed/feed-1", type: "feed", feedId: "feed-1", deletedAt: null } as any,
    ])
    vi.spyOn(EntryAnnotationService, "getNotes").mockResolvedValue([])
    vi.spyOn(EntryAnnotationService, "getHighlights").mockResolvedValue([])
    vi.spyOn(EntryRuleService, "getTags").mockResolvedValue([])
  })

  afterEach(() => {
    searchActions.reset()
    vi.restoreAllMocks()
  })

  it("finds decoded titles and keywords far into the stored body", async () => {
    const search = await searchActions.createLocalDbSearch()
    expect((await search.search("lynan's")).entries[0]?.item.title).toBe("Lynan's Page")
    expect((await search.search("  独特关键词  ")).entries.map(({ item }) => item.id)).toEqual([
      "article-1",
    ])
    expect((await search.search("独特关键词")).feeds).toEqual([])
    expect((await search.search("不存在的搜索结果")).entries).toEqual([])
    expect((await search.search("   ")).entries).toEqual([])
  })

  it("excludes an unsubscribed feed and its retained articles on subsequent searches", async () => {
    const search = await searchActions.createLocalDbSearch()
    expect((await search.search("lynan")).entries).toHaveLength(1)
    vi.mocked(SubscriptionService.getSubscriptionAll).mockResolvedValue([])
    searchActions.setSearchType(SearchType.All)
    const result = await search.search("lynan")
    expect(result.entries).toEqual([])
    expect(result.feeds).toEqual([])
    const reopened = await searchActions.createLocalDbSearch()
    expect(reopened.counts.feeds).toBe(0)
  })

  it("switches to title-only search without rebuilding the index", async () => {
    const search = await searchActions.createLocalDbSearch()
    expect((await search.search("独特关键词")).entries).toHaveLength(1)
    searchActions.setSearchScope("title")
    expect((await search.search("独特关键词")).entries).toEqual([])
    expect((await search.search("Lynan")).entries).toHaveLength(1)
    expect(EntryService.getSearchPage).toHaveBeenCalledTimes(2)
  })

  it("handles an empty library", async () => {
    vi.mocked(EntryService.getSearchCount).mockResolvedValue(0)
    vi.mocked(EntryService.getSearchPage).mockReset().mockResolvedValue([])
    const search = await searchActions.createLocalDbSearch()
    expect(search.counts.entries).toBe(0)
    expect((await search.search("anything")).entries).toEqual([])
  })

  it("keeps notes, highlights and tags searchable", async () => {
    vi.mocked(EntryAnnotationService.getNotes).mockResolvedValue([
      { entryId: "article-1", content: "独立笔记" } as Awaited<
        ReturnType<typeof EntryAnnotationService.getNotes>
      >[number],
    ])
    vi.mocked(EntryAnnotationService.getHighlights).mockResolvedValue([
      { entryId: "article-1", quote: "选中的引文" } as Awaited<
        ReturnType<typeof EntryAnnotationService.getHighlights>
      >[number],
    ])
    vi.mocked(EntryRuleService.getTags).mockResolvedValue([
      { entryId: "article-1", tag: "阅读标签" } as Awaited<
        ReturnType<typeof EntryRuleService.getTags>
      >[number],
    ])
    const search = await searchActions.createLocalDbSearch()
    for (const keyword of ["独立笔记", "选中的引文", "阅读标签"]) {
      expect((await search.search(keyword)).entries.map(({ item }) => item.id)).toEqual([
        "article-1",
      ])
    }
  })
  it("does not load article bodies for an empty query or feed-only search", async () => {
    const search = await searchActions.createLocalDbSearch()
    await search.search(" ")
    searchActions.setSearchType(SearchType.Feed)
    await search.search("lynan")
    expect(EntryService.getSearchPage).not.toHaveBeenCalled()
    expect(EntryService.getEntryAll).not.toHaveBeenCalled()
    expect(SearchWorkerClient).not.toHaveBeenCalled()
  })

  it("coalesces rapid typing, pages the index once and returns only lightweight results", async () => {
    const search = await searchActions.createLocalDbSearch()
    const obsolete = search.search("obsolete")
    const current = search.search("独特关键词")
    await Promise.all([obsolete, current])
    expect(useSearchStore.getState().keyword).toBe("独特关键词")
    expect(useSearchStore.getState().entries[0]?.item).not.toHaveProperty("content")
    expect(EntryService.getSearchPage).toHaveBeenNthCalledWith(2, "article-1")
    await search.search("独特关键词")
    expect(EntryService.getSearchPage).toHaveBeenCalledTimes(2)
    expect(EntryService.getEntryAll).not.toHaveBeenCalled()
  })

  it("discards a late result after close and releases the worker", async () => {
    let complete!: (items: any[]) => void
    const dispose = vi.fn()
    vi.mocked(SearchWorkerClient).mockImplementation(
      () =>
        ({
          add: vi.fn().mockResolvedValue(undefined),
          search: vi.fn(
            () =>
              new Promise((resolve) => {
                complete = resolve
              }),
          ),
          dispose,
        }) as unknown as SearchWorkerClient,
    )
    const search = await searchActions.createLocalDbSearch()
    const pending = search.search("article")
    await vi.waitFor(() => expect(complete).toBeDefined())
    searchActions.reset()
    complete([{ id: "late", feedId: "feed-1", title: "Late" }])
    await pending
    expect(useSearchStore.getState().entries).toEqual([])
    expect(dispose).toHaveBeenCalled()
  })
  it("keeps only the latest query when a worker search is already running", async () => {
    let complete!: (items: any[]) => void
    const query = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      )
      .mockResolvedValue([{ id: "new", feedId: "feed-1", title: "New" }])
    vi.mocked(SearchWorkerClient).mockImplementation(
      () =>
        ({
          add: vi.fn().mockResolvedValue(undefined),
          search: query,
          dispose: vi.fn(),
        }) as unknown as SearchWorkerClient,
    )
    const search = await searchActions.createLocalDbSearch()
    const old = search.search("old")
    await vi.waitFor(() => expect(complete).toBeDefined())
    const latest = search.search("new")
    complete([{ id: "old", feedId: "feed-1", title: "Old" }])
    await Promise.all([old, latest])
    expect(useSearchStore.getState().keyword).toBe("new")
    expect(useSearchStore.getState().entries.map(({ item }) => item.id)).toEqual(["new"])
  })
})
