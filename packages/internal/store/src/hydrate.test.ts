import type { FeedViewType } from "@suhui/constants"
import { EntryService } from "@suhui/database/services/entry"
import { FeedService } from "@suhui/database/services/feed"
import { SubscriptionService } from "@suhui/database/services/subscription"
import { UnreadService } from "@suhui/database/services/unread"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getHydratePhaseState, resetHydratePhases, startHydrateInteractive } from "./hydrate-phases"
import { hydrateDatabaseToStore } from "./hydrate"
import { collectionActions } from "./modules/collection/store"
import { useEntryStore, defaultState as defaultEntryState } from "./modules/entry/base"
import { entryActions } from "./modules/entry/store"
import { feedActions, useFeedStore } from "./modules/feed/store"
import { imageActions } from "./modules/image/store"
import { inboxActions } from "./modules/inbox/store"
import { listActions } from "./modules/list/store"
import { subscriptionActions, useSubscriptionStore } from "./modules/subscription/store"
import { summaryActions } from "./modules/summary/store"
import { translationActions } from "./modules/translation/store"
import { unreadActions, useUnreadStore } from "./modules/unread/store"
import { userActions, useUserStore } from "./modules/user/store"

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

const baseFeed = (title: string) =>
  ({
    id: "feed-1",
    type: "feed",
    title,
    url: "https://example.com/feed.xml",
    description: null,
    image: null,
    errorAt: null,
    siteUrl: null,
    ownerUserId: null,
    errorMessage: null,
    subscriptionCount: null,
    updatesPerWeek: null,
    latestEntryPublishedAt: null,
    tipUserIds: null,
    updatedAt: null,
  }) as any

const baseSubscription = (patch: Record<string, unknown> = {}) =>
  ({
    id: "sub-1",
    feedId: "feed-1",
    listId: null,
    inboxId: null,
    userId: "user-1",
    view: 0 as FeedViewType,
    isPrivate: false,
    hideFromTimeline: false,
    title: "DB subscription",
    category: "news",
    type: "feed",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  }) as any

const baseEntry = (patch: Record<string, unknown> = {}) =>
  ({
    id: "entry-1",
    feedId: "feed-1",
    inboxHandle: null,
    sources: [],
    title: "Entry",
    url: "https://example.com/entry",
    guid: "guid-1",
    content: null,
    description: null,
    insertedAt: 1,
    publishedAt: 1,
    read: false,
    readabilityContent: null,
    readabilityUpdatedAt: null,
    author: null,
    media: null,
    categories: null,
    attachments: null,
    extra: null,
    settings: null,
    ...patch,
  }) as any

const resetStores = () => {
  useFeedStore.setState({ feeds: {} })
  subscriptionActions.replaceManyInSession([])
  useEntryStore.setState({
    data: {},
    entryIdByView: Object.fromEntries(
      Object.keys(defaultEntryState.entryIdByView).map((key) => [key, new Set<string>()]),
    ) as unknown as typeof defaultEntryState.entryIdByView,
    entryIdByCategory: {},
    entryIdByFeed: {},
    entryIdByInbox: {},
    entryIdByList: {},
    entryIdSet: new Set(),
  })
  useUnreadStore.setState({ data: {} })
  useUserStore.setState({
    users: {},
    whoami: null,
    role: null,
    roleEndAt: null,
  })
  resetHydratePhases()
}

describe("hydrateDatabaseToStore", () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetStores()
  })

  it("runs critical hydrate in order and returns before deferred hydrate finishes", async () => {
    const order: string[] = []
    const deferredHydrate = createDeferred<void>()

    vi.spyOn(feedActions, "hydrate").mockImplementation(async () => {
      order.push("feed")
    })
    vi.spyOn(subscriptionActions, "hydrate").mockImplementation(async () => {
      order.push("subscription")
    })
    vi.spyOn(userActions, "hydrate").mockImplementation(async () => {
      order.push("user")
    })
    vi.spyOn(entryActions, "hydrate").mockImplementation(async () => {
      order.push("entry")
    })
    vi.spyOn(unreadActions, "hydrate").mockImplementation(async () => {
      order.push("unread")
    })
    vi.spyOn(inboxActions, "hydrate").mockImplementation(async () => {
      order.push("inbox")
    })
    vi.spyOn(listActions, "hydrate").mockImplementation(async () => {
      order.push("list")
    })
    vi.spyOn(collectionActions, "hydrate").mockImplementation(async () => {
      order.push("collection")
    })
    vi.spyOn(summaryActions, "hydrate").mockImplementation(async () => {
      order.push("summary")
    })
    vi.spyOn(translationActions, "hydrate").mockImplementation(async () => {
      order.push("translation")
    })
    vi.spyOn(imageActions, "hydrate").mockImplementation(async () => {
      order.push("image:start")
      await deferredHydrate.promise
      order.push("image:end")
    })

    await hydrateDatabaseToStore()

    expect(order.slice(0, 5)).toEqual(["feed", "subscription", "user", "entry", "unread"])
    expect(order).toContain("image:start")
    expect(order).not.toContain("image:end")
    expect(getHydratePhaseState().phase).toBe("deferred")

    deferredHydrate.resolve()
    await deferredHydrate.promise
  })

  it("preserves startup-window dirty fields when hydrate snapshot arrives during the critical barrier", async () => {
    const localFeed = baseFeed("Local title")
    const localSubscription = baseSubscription({
      title: "Local subscription",
      category: "local-category",
      hideFromTimeline: true,
      isPrivate: true,
      view: 1,
    })
    const localEntry = baseEntry({ read: false })

    feedActions.upsertManyInSession([localFeed])
    subscriptionActions.upsertManyInSession([localSubscription])
    entryActions.upsertManyInSession([localEntry])
    unreadActions.upsertManyInSession([{ id: "feed-1", count: 5 }])

    startHydrateInteractive()

    feedActions.patchInSession("feed-1", { title: "User edited title" })
    subscriptionActions.upsertManyInSession([
      {
        ...localSubscription,
        title: "User edited subscription",
        category: "user-category",
        hideFromTimeline: false,
        isPrivate: false,
        view: 2,
      } as any,
    ])
    entryActions.markEntryReadStatusInSession({ entryIds: ["entry-1"], read: true })
    unreadActions.upsertManyInSession([{ id: "feed-1", count: 0 }])

    vi.spyOn(FeedService, "getFeedAll").mockResolvedValue([baseFeed("DB title")] as any)
    vi.spyOn(SubscriptionService, "getSubscriptionAll").mockResolvedValue([
      baseSubscription({
        title: "DB subscription",
        category: "db-category",
        hideFromTimeline: true,
        isPrivate: true,
        view: 0,
      }),
    ] as any)
    vi.spyOn(EntryService, "getEntriesToHydrate").mockResolvedValue([
      baseEntry({ read: false }),
    ] as any)
    vi.spyOn(UnreadService, "getUnreadAll").mockResolvedValue([{ id: "feed-1", count: 9 }] as any)

    await feedActions.hydrate()
    await subscriptionActions.hydrate()
    await entryActions.hydrate()
    await unreadActions.hydrate()

    expect(useFeedStore.getState().feeds["feed-1"]?.title).toBe("User edited title")
    expect(useSubscriptionStore.getState().data["feed-1"]).toMatchObject({
      title: "User edited subscription",
      category: "user-category",
      hideFromTimeline: false,
      isPrivate: false,
      view: 2,
    })
    expect(useEntryStore.getState().data["entry-1"]?.read).toBe(true)
    expect(useUnreadStore.getState().data["feed-1"]).toBe(0)
  })
})
