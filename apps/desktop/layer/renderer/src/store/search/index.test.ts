import { EntryService } from "@suhui/database/services/entry"
import { EntryAnnotationService } from "@suhui/database/services/entry-annotation"
import { EntryRuleService } from "@suhui/database/services/entry-rule"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { searchActions } from "."
import { SearchType } from "./constants"

describe("local article search", () => {
  beforeEach(() => {
    searchActions.reset()
    searchActions.setSearchType(SearchType.Entry)
    vi.spyOn(EntryService, "getEntryAll").mockResolvedValue([
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
    vi.spyOn(SubscriptionService, "getSubscriptionAll").mockResolvedValue([])
    vi.spyOn(EntryAnnotationService, "getNotes").mockResolvedValue([])
    vi.spyOn(EntryAnnotationService, "getHighlights").mockResolvedValue([])
    vi.spyOn(EntryRuleService, "getTags").mockResolvedValue([])
  })

  afterEach(() => vi.restoreAllMocks())

  it("finds decoded titles and keywords far into the stored body", async () => {
    const search = await searchActions.createLocalDbSearch()
    expect(search.search("lynan's").entries[0]?.item.title).toBe("Lynan's Page")
    expect(search.search("  独特关键词  ").entries.map(({ item }) => item.id)).toEqual([
      "article-1",
    ])
    expect(search.search("独特关键词").feeds).toEqual([])
    expect(search.search("不存在的搜索结果").entries).toEqual([])
    expect(search.search("   ").entries).toEqual([])
  })

  it("handles an empty library", async () => {
    vi.mocked(EntryService.getEntryAll).mockResolvedValue([])
    const search = await searchActions.createLocalDbSearch()
    expect(search.counts.entries).toBe(0)
    expect(search.search("anything").entries).toEqual([])
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
      expect(search.search(keyword).entries.map(({ item }) => item.id)).toEqual(["article-1"])
    }
  })
})
