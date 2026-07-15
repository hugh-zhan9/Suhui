// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RemoteBootstrapPayload } from "./bootstrap"

const mocks = vi.hoisted(() => ({
  replaceSubscriptions: vi.fn(),
  restoreFeeds: vi.fn(),
  mergeFeeds: vi.fn(),
  resetFeeds: vi.fn(),
  upsertUnread: vi.fn(),
  upsertCollections: vi.fn(),
  disconnect: vi.fn(),
}))

vi.mock("../modules/collection/store", () => ({
  collectionActions: { upsertManyInSession: mocks.upsertCollections },
}))
vi.mock("../modules/feed/store", () => ({
  feedActions: {
    restoreHydratedSnapshotInSession: mocks.restoreFeeds,
    upsertManyInSession: mocks.mergeFeeds,
  },
  useFeedStore: { setState: mocks.resetFeeds },
}))
vi.mock("../modules/subscription/store", () => ({
  subscriptionActions: { replaceManyInSession: mocks.replaceSubscriptions },
}))
vi.mock("../modules/unread/store", () => ({
  unreadActions: { upsertManyInSession: mocks.upsertUnread },
}))
vi.mock("./sse-handler", () => ({
  remoteSSEHandler: { disconnect: mocks.disconnect },
}))

const modulePromise = import("./bootstrap")
const {
  applyRemoteBootstrapInSession,
  beginRemoteBootstrapLoading,
  failRemoteBootstrapLoading,
  resetRemoteBootstrapStores,
  useRemoteBootstrapStore,
} = await modulePromise

const validPayload = {
  subscriptions: [
    { id: "feed/feed-1", type: "feed", feedId: "feed-1", title: "Feed One", view: 1 },
    { id: "list/list-1", type: "list", listId: "list-1", title: "List One", view: 2 },
    { id: "inbox/inbox-1", type: "inbox", inboxId: "inbox-1", title: "Inbox One", view: 3 },
  ],
  feeds: [{ id: "feed-1", title: "Feed One", url: "https://example.com/feed.xml" }],
  unread: [{ id: "feed-1", count: 3 }],
  collections: [{ entryId: "entry-1", feedId: "feed-1", view: 1 }],
  settings: { appearance: "system" as const, rsshubCustomUrl: "" },
  capabilities: { pdfExport: true },
} satisfies RemoteBootstrapPayload

const applyMalformedPayload = (payload: unknown) =>
  applyRemoteBootstrapInSession(payload as RemoteBootstrapPayload)

const expectNoMetadataActions = () => {
  expect(mocks.replaceSubscriptions).not.toHaveBeenCalled()
  expect(mocks.restoreFeeds).not.toHaveBeenCalled()
  expect(mocks.mergeFeeds).not.toHaveBeenCalled()
  expect(mocks.upsertUnread).not.toHaveBeenCalled()
  expect(mocks.upsertCollections).not.toHaveBeenCalled()
}

const readWrittenMetadata = () => ({
  subscriptions: mocks.replaceSubscriptions.mock.lastCall?.[0],
  feeds: mocks.restoreFeeds.mock.lastCall?.[0],
  unread: mocks.upsertUnread.mock.lastCall?.[0],
  collections: mocks.upsertCollections.mock.lastCall?.[0],
  bootstrap: useRemoteBootstrapStore.getState(),
})

describe("remote bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRemoteBootstrapStores()
    vi.clearAllMocks()
  })

  it("does not publish a partial malformed bootstrap", () => {
    applyRemoteBootstrapInSession(validPayload)
    const previousState = useRemoteBootstrapStore.getState()
    vi.clearAllMocks()

    expect(() =>
      applyRemoteBootstrapInSession({ ...validPayload, unread: [{ id: "feed-1", count: -1 }] }),
    ).toThrow("Invalid remote bootstrap")

    expectNoMetadataActions()
    expect(useRemoteBootstrapStore.getState()).toEqual(previousState)
  })

  it("preserves every previous metadata store when a subscription view is invalid", () => {
    applyRemoteBootstrapInSession(validPayload)
    const previousStores = readWrittenMetadata()
    vi.clearAllMocks()

    expect(() =>
      applyRemoteBootstrapInSession({
        ...validPayload,
        subscriptions: [
          {
            id: "feed/feed-1",
            type: "feed",
            feedId: "feed-1",
            title: "Feed One",
            view: 999,
          },
        ],
      }),
    ).toThrow("Invalid remote bootstrap: subscriptions")

    expectNoMetadataActions()
    expect(readWrittenMetadata().bootstrap).toEqual(previousStores.bootstrap)
  })

  it.each([null, 1, "pdf", []])(
    "preserves every previous metadata store for malformed capabilities %j",
    (capabilities) => {
      applyRemoteBootstrapInSession(validPayload)
      const previousStores = readWrittenMetadata()
      vi.clearAllMocks()

      expect(() => applyRemoteBootstrapInSession({ ...validPayload, capabilities })).toThrow(
        "Invalid remote bootstrap: capabilities",
      )

      expectNoMetadataActions()
      expect(readWrittenMetadata().bootstrap).toEqual(previousStores.bootstrap)
    },
  )

  it.each([
    ["unknown discriminator", { id: "feed/feed-1", type: "folder", feedId: "feed-1", view: 1 }],
    ["missing matching source", { id: "feed/feed-1", type: "feed", view: 1 }],
    ["empty matching source", { id: "list/list-1", type: "list", listId: "  ", view: 1 }],
    [
      "mismatched source",
      { id: "inbox/inbox-1", type: "inbox", feedId: "feed-1", inboxId: "inbox-1", view: 1 },
    ],
  ])("preserves previous metadata for an invalid subscription %s", (_label, subscription) => {
    applyRemoteBootstrapInSession(validPayload)
    const previousState = useRemoteBootstrapStore.getState()
    vi.clearAllMocks()

    expect(() => applyMalformedPayload({ ...validPayload, subscriptions: [subscription] })).toThrow(
      "Invalid remote bootstrap: subscriptions",
    )

    expectNoMetadataActions()
    expect(useRemoteBootstrapStore.getState()).toEqual(previousState)
  })

  it.each([1.5, 999, undefined])(
    "preserves previous metadata for invalid collection view %j",
    (view) => {
      applyRemoteBootstrapInSession(validPayload)
      const previousState = useRemoteBootstrapStore.getState()
      vi.clearAllMocks()

      expect(() =>
        applyMalformedPayload({
          ...validPayload,
          collections: [{ entryId: "entry-1", feedId: "feed-1", view }],
        }),
      ).toThrow("Invalid remote bootstrap: collections")

      expectNoMetadataActions()
      expect(useRemoteBootstrapStore.getState()).toEqual(previousState)
    },
  )

  it.each([
    ["subscription id", { subscriptions: [{ ...validPayload.subscriptions[0], id: " " }] }],
    ["feed id", { feeds: [{ ...validPayload.feeds[0], id: " " }] }],
    ["unread id", { unread: [{ ...validPayload.unread[0], id: " " }] }],
    ["collection entry id", { collections: [{ ...validPayload.collections[0], entryId: " " }] }],
    ["collection source id", { collections: [{ ...validPayload.collections[0], feedId: " " }] }],
  ])("preserves previous metadata for an empty %s", (_label, override) => {
    applyRemoteBootstrapInSession(validPayload)
    const previousState = useRemoteBootstrapStore.getState()
    vi.clearAllMocks()

    expect(() => applyMalformedPayload({ ...validPayload, ...override })).toThrow(
      "Invalid remote bootstrap",
    )

    expectNoMetadataActions()
    expect(useRemoteBootstrapStore.getState()).toEqual(previousState)
  })

  it("replaces all metadata synchronously and reports exact loaded counts", () => {
    const result = applyRemoteBootstrapInSession(validPayload)

    expect(mocks.replaceSubscriptions).toHaveBeenCalledTimes(1)
    expect(mocks.replaceSubscriptions).toHaveBeenCalledWith([
      expect.objectContaining({ type: "feed", feedId: "feed-1", listId: null, inboxId: null }),
      expect.objectContaining({ type: "list", feedId: null, listId: "list-1", inboxId: null }),
      expect.objectContaining({ type: "inbox", feedId: null, listId: null, inboxId: "inbox-1" }),
    ])
    expect(mocks.restoreFeeds).toHaveBeenCalledTimes(1)
    expect(mocks.restoreFeeds).toHaveBeenCalledWith([
      expect.objectContaining({ id: "feed-1", title: "Feed One" }),
    ])
    expect(mocks.mergeFeeds).not.toHaveBeenCalled()
    expect(mocks.upsertUnread).toHaveBeenCalledWith([{ id: "feed-1", count: 3 }], {
      reset: true,
      source: "runtime",
    })
    expect(mocks.upsertCollections).toHaveBeenCalledWith(
      [expect.objectContaining({ entryId: "entry-1" })],
      { reset: true },
    )
    expect(result).toEqual({
      phase: "ready",
      error: null,
      subscriptionsLoaded: 3,
      feedsLoaded: 1,
      unreadLoaded: 1,
      collectionsLoaded: 1,
      settings: validPayload.settings,
      capabilities: validPayload.capabilities,
    })
    expect(useRemoteBootstrapStore.getState()).toEqual(result)
  })

  it("keeps ordinary retry state changes separate from destructive reset", () => {
    applyRemoteBootstrapInSession(validPayload)
    vi.clearAllMocks()

    beginRemoteBootstrapLoading()
    failRemoteBootstrapLoading(new Error("offline"))
    expect(useRemoteBootstrapStore.getState()).toEqual({
      phase: "error",
      error: "offline",
      subscriptionsLoaded: 3,
      feedsLoaded: 1,
      unreadLoaded: 1,
      collectionsLoaded: 1,
      settings: validPayload.settings,
      capabilities: validPayload.capabilities,
    })
    beginRemoteBootstrapLoading()

    expect(useRemoteBootstrapStore.getState().phase).toBe("loading")
    expect(useRemoteBootstrapStore.getState().settings).toEqual(validPayload.settings)
    expect(mocks.replaceSubscriptions).not.toHaveBeenCalled()
    expect(mocks.restoreFeeds).not.toHaveBeenCalled()
    expect(mocks.mergeFeeds).not.toHaveBeenCalled()
    expect(mocks.upsertUnread).not.toHaveBeenCalled()
    expect(mocks.upsertCollections).not.toHaveBeenCalled()
    expect(mocks.disconnect).not.toHaveBeenCalled()

    resetRemoteBootstrapStores()
    expect(mocks.disconnect).toHaveBeenCalledTimes(1)
    expect(mocks.replaceSubscriptions).toHaveBeenCalledWith([])
    expect(mocks.resetFeeds).toHaveBeenCalledWith({ feeds: {} })
    expect(mocks.upsertUnread).toHaveBeenCalledWith([], { reset: true, source: "runtime" })
    expect(mocks.upsertCollections).toHaveBeenCalledWith([], { reset: true })
    expect(useRemoteBootstrapStore.getState()).toEqual({
      phase: "loading",
      error: null,
      subscriptionsLoaded: 0,
      feedsLoaded: 0,
      unreadLoaded: 0,
      collectionsLoaded: 0,
      settings: null,
      capabilities: null,
    })
  })
})
