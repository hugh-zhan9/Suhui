import { FeedViewType } from "@suhui/constants"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { entrySyncServices, useEntryStore } from "@suhui/store/entry/store"
import { subscriptionActions, useSubscriptionStore } from "@suhui/store/subscription/store"

const makeEmptySetMap = () => ({
  [FeedViewType.All]: new Set<string>(),
  [FeedViewType.Articles]: new Set<string>(),
  [FeedViewType.Audios]: new Set<string>(),
  [FeedViewType.Notifications]: new Set<string>(),
  [FeedViewType.Pictures]: new Set<string>(),
  [FeedViewType.SocialMedia]: new Set<string>(),
  [FeedViewType.Videos]: new Set<string>(),
})

const makeEmptyCategoryOpenState = () => ({
  [FeedViewType.All]: {},
  [FeedViewType.Articles]: {},
  [FeedViewType.Audios]: {},
  [FeedViewType.Notifications]: {},
  [FeedViewType.Pictures]: {},
  [FeedViewType.SocialMedia]: {},
  [FeedViewType.Videos]: {},
})

describe("remote store sync", () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      data: {},
      feedIdByView: makeEmptySetMap(),
      listIdByView: makeEmptySetMap(),
      categories: makeEmptySetMap(),
      subscriptionIdSet: new Set<string>(),
      categoryOpenStateByView: makeEmptyCategoryOpenState(),
    })

    useEntryStore.setState({
      data: {},
      entryIdByView: makeEmptySetMap(),
      entryIdByCategory: {},
      entryIdByFeed: {},
      entryIdByInbox: {},
      entryIdByList: {},
      entryIdSet: new Set<string>(),
    })
    ;(globalThis as any).window = { __REMOTE_RUNTIME__: true }
    globalThis.fetch = vi.fn()
  })

  it("远程订阅同步应全量替换而不是保留已删除订阅", async () => {
    await subscriptionActions.upsertManyInSession([
      {
        feedId: "feed-a",
        listId: null,
        inboxId: null,
        userId: "remote-user",
        view: FeedViewType.Articles,
        isPrivate: false,
        hideFromTimeline: false,
        title: "Feed A",
        category: "cat-a",
        createdAt: new Date().toISOString(),
        type: "feed",
      },
      {
        feedId: "feed-b",
        listId: null,
        inboxId: null,
        userId: "remote-user",
        view: FeedViewType.Articles,
        isPrivate: false,
        hideFromTimeline: false,
        title: "Feed B",
        category: "cat-b",
        createdAt: new Date().toISOString(),
        type: "feed",
      },
    ])

    await subscriptionActions.replaceManyInSession([
      {
        feedId: "feed-a",
        listId: null,
        inboxId: null,
        userId: "remote-user",
        view: FeedViewType.Articles,
        isPrivate: false,
        hideFromTimeline: false,
        title: "Feed A",
        category: "cat-a",
        createdAt: new Date().toISOString(),
        type: "feed",
      },
    ])

    const state = useSubscriptionStore.getState()
    expect(Object.keys(state.data)).toEqual(["feed-a"])
    expect(state.feedIdByView[FeedViewType.All].has("feed-b")).toBe(false)
    expect(state.feedIdByView[FeedViewType.Articles].has("feed-b")).toBe(false)
  })

  it("远程详情读取在缓存缺少正文时仍应请求服务端详情", async () => {
    useEntryStore.setState({
      data: {
        "entry-1": {
          id: "entry-1",
          feedId: "feed-a",
          inboxHandle: null,
          title: "Entry 1",
          url: "https://example.com/entry-1",
          content: null,
          readabilityContent: null,
          readabilityUpdatedAt: null,
          description: "Summary",
          guid: "entry-1",
          author: null,
          authorUrl: null,
          authorAvatar: null,
          insertedAt: Date.now(),
          publishedAt: Date.now(),
          media: null,
          categories: null,
          attachments: null,
          extra: null,
          language: null,
          read: false,
          sources: null,
          settings: null,
        },
      },
      entryIdByView: makeEmptySetMap(),
      entryIdByCategory: {},
      entryIdByFeed: { "feed-a": new Set(["entry-1"]) },
      entryIdByInbox: {},
      entryIdByList: {},
      entryIdSet: new Set(["entry-1"]),
    })

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: "entry-1",
          feedId: "feed-a",
          title: "Entry 1",
          content: "<p>Full content</p>",
          readabilityContent: "<article>Readable</article>",
          publishedAt: Date.now(),
          insertedAt: Date.now(),
        },
      }),
    } as Response)

    const entry = await entrySyncServices.fetchEntryDetail("entry-1")

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/entries/entry-1")
    expect(entry?.readabilityContent).toBe("<article>Readable</article>")
  })
})
