import { describe, expect, it } from "vitest"

import { transformEntryFromApi, transformRemoteBootstrapFromApi } from "./transforms"

describe("remote entry transforms", () => {
  it("keeps missing publishedAt as unknown instead of faking current time", () => {
    const entry = transformEntryFromApi({
      id: "entry-1",
      feedId: "feed-1",
      title: "Entry 1",
      insertedAt: 1_710_000_000_000,
      publishedAt: null,
    })

    expect(entry.publishedAt).toBe(0)
    expect(entry.insertedAt).toBe(1_710_000_000_000)
  })
})

describe("remote bootstrap transforms", () => {
  it("validates and transforms all six metadata groups", () => {
    const result = transformRemoteBootstrapFromApi({
      subscriptions: [
        {
          id: "feed/feed-1",
          type: "feed",
          feedId: "feed-1",
          title: "Feed One",
          view: 1,
        },
        {
          id: "list/list-1",
          type: "list",
          listId: "list-1",
          title: "List One",
          view: 2,
        },
        {
          id: "inbox/inbox-1",
          type: "inbox",
          inboxId: "inbox-1",
          title: "Inbox One",
          view: 3,
        },
      ],
      feeds: [{ id: "feed-1", title: "Feed One", url: "https://example.com/feed.xml" }],
      unread: [{ id: "feed-1", count: 3 }],
      collections: [{ entryId: "entry-1", feedId: "feed-1", view: 1 }],
      settings: { appearance: "system", rsshubCustomUrl: "" },
      capabilities: { pdfExport: true },
    })

    expect(result.subscriptions).toEqual([
      expect.objectContaining({ type: "feed", feedId: "feed-1", title: "Feed One", view: 1 }),
      expect.objectContaining({ type: "list", listId: "list-1", title: "List One", view: 2 }),
      expect.objectContaining({
        type: "inbox",
        inboxId: "inbox-1",
        title: "Inbox One",
        view: 3,
      }),
    ])
    expect(result.feeds).toEqual([
      { id: "feed-1", title: "Feed One", url: "https://example.com/feed.xml" },
    ])
    expect(result.unread).toEqual([{ id: "feed-1", count: 3 }])
    expect(result.collections).toEqual([
      expect.objectContaining({
        entryId: "entry-1",
        feedId: "feed-1",
        view: 1,
        createdAt: "1970-01-01T00:00:00.000Z",
      }),
    ])
    expect(result.settings).toEqual({ appearance: "system", rsshubCustomUrl: "" })
    expect(result.capabilities).toEqual({ pdfExport: true })
  })

  it.each([
    ["missing group", { subscriptions: [], feeds: [], unread: [], collections: [], settings: {} }],
    [
      "malformed member",
      {
        subscriptions: [],
        feeds: [{ id: 1 }],
        unread: [],
        collections: [],
        settings: { appearance: "system", rsshubCustomUrl: "" },
        capabilities: {},
      },
    ],
    [
      "invalid subscription view",
      {
        subscriptions: [{ id: "feed/feed-1", type: "feed", feedId: "feed-1", view: 999 }],
        feeds: [],
        unread: [],
        collections: [],
        settings: { appearance: "system", rsshubCustomUrl: "" },
        capabilities: {},
      },
    ],
    [
      "invalid subscription discriminator",
      {
        subscriptions: [{ id: "feed/feed-1", type: "folder", feedId: "feed-1", view: 1 }],
        feeds: [],
        unread: [],
        collections: [],
        settings: { appearance: "system", rsshubCustomUrl: "" },
        capabilities: {},
      },
    ],
    [
      "mismatched subscription source",
      {
        subscriptions: [
          { id: "list/list-1", type: "list", feedId: "feed-1", listId: "list-1", view: 1 },
        ],
        feeds: [],
        unread: [],
        collections: [],
        settings: { appearance: "system", rsshubCustomUrl: "" },
        capabilities: {},
      },
    ],
    [
      "fractional collection view",
      {
        subscriptions: [],
        feeds: [],
        unread: [],
        collections: [{ entryId: "entry-1", view: 1.5 }],
        settings: { appearance: "system", rsshubCustomUrl: "" },
        capabilities: {},
      },
    ],
    [
      "empty required identifier",
      {
        subscriptions: [],
        feeds: [{ id: "   " }],
        unread: [],
        collections: [],
        settings: { appearance: "system", rsshubCustomUrl: "" },
        capabilities: {},
      },
    ],
  ])("rejects a %s before returning local values", (_label, payload) => {
    expect(() => transformRemoteBootstrapFromApi(payload)).toThrow("Invalid remote bootstrap")
  })

  it.each([null, 1, "pdf", []])("rejects malformed capabilities %j", (capabilities) => {
    expect(() =>
      transformRemoteBootstrapFromApi({
        subscriptions: [],
        feeds: [],
        unread: [],
        collections: [],
        settings: { appearance: "system", rsshubCustomUrl: "" },
        capabilities,
      }),
    ).toThrow("Invalid remote bootstrap: capabilities")
  })
})
