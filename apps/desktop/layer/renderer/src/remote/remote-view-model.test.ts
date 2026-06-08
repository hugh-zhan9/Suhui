import { FeedViewType } from "@suhui/constants"
import { describe, expect, it } from "vitest"

import {
  buildRemoteFeedGroups,
  getRemoteDesktopLayoutContract,
  getRemoteEntryReadVisualState,
  getRemotePreferredEntrySelection,
  getRemoteAvailableViews,
  parseRemoteImportPayload,
  shouldRemoteMarkReadFromSelection,
  toRemoteDownloadFileName,
} from "./remote-view-model"

describe("remote view model", () => {
  const subscriptions = {
    feed_a: {
      id: "feed/feed_a",
      type: "feed",
      feedId: "feed_a",
      title: "Alpha",
      category: "Design",
      view: FeedViewType.Articles,
    },
    feed_b: {
      id: "feed/feed_b",
      type: "feed",
      feedId: "feed_b",
      title: "Beta",
      category: "Design",
      view: FeedViewType.Articles,
    },
    feed_c: {
      id: "feed/feed_c",
      type: "feed",
      feedId: "feed_c",
      title: "Cinema",
      category: null,
      view: FeedViewType.Videos,
    },
    list_1: {
      id: "list/list_1",
      type: "list",
      listId: "list_1",
      title: "Not a feed",
      view: FeedViewType.Articles,
    },
  } as any

  it("groups remote feed subscriptions by category for the selected view", () => {
    expect(buildRemoteFeedGroups(subscriptions, FeedViewType.Articles)).toEqual([
      {
        key: "Design",
        title: "Design",
        feeds: [
          { feedId: "feed_a", title: "Alpha", category: "Design" },
          { feedId: "feed_b", title: "Beta", category: "Design" },
        ],
      },
    ])
  })

  it("returns views that have feed subscriptions and always keeps All when feeds exist", () => {
    const views = getRemoteAvailableViews(subscriptions).map((view) => view.view)

    expect(views).toContain(FeedViewType.All)
    expect(views).toContain(FeedViewType.Articles)
    expect(views).toContain(FeedViewType.Videos)
    expect(views).not.toContain(FeedViewType.Pictures)
  })

  it("parses import JSON and rejects malformed payloads", () => {
    expect(parseRemoteImportPayload('{"version":1,"subscriptions":[]}')).toEqual({
      version: 1,
      subscriptions: [],
    })

    expect(() => parseRemoteImportPayload("not json")).toThrow("Invalid JSON")
    expect(() => parseRemoteImportPayload("[]")).toThrow("Invalid import payload")
  })

  it("creates a browser-safe PDF file name", () => {
    expect(toRemoteDownloadFileName("A/B:C*D?", "entry-id")).toBe("A-B-C-D.pdf")
    expect(toRemoteDownloadFileName("", "entry/id")).toBe("entry-id.pdf")
  })

  it("defines a desktop-parity remote layout contract", () => {
    expect(getRemoteDesktopLayoutContract()).toEqual({
      root: "remote-desktop-reader",
      sidebar: "remote-desktop-sidebar",
      timeline: "remote-desktop-timeline",
      reader: "remote-desktop-reader-pane",
      sidebarWidth: 256,
      timelineWidth: 390,
    })
  })

  it("only marks a remote entry read after a user opens it", () => {
    expect(
      shouldRemoteMarkReadFromSelection({
        entryId: "entry_1",
        read: false,
        reason: "initial-selection",
      }),
    ).toBe(false)
    expect(
      shouldRemoteMarkReadFromSelection({
        entryId: "entry_2",
        read: false,
        reason: "selection-sync",
      }),
    ).toBe(false)
    expect(
      shouldRemoteMarkReadFromSelection({
        entryId: "entry_3",
        read: false,
        reason: "user-open",
      }),
    ).toBe(true)
    expect(
      shouldRemoteMarkReadFromSelection({
        entryId: "entry_4",
        read: true,
        reason: "user-open",
      }),
    ).toBe(false)
  })

  it("exposes an explicit visual contract for unread and read entry rows", () => {
    expect(getRemoteEntryReadVisualState(false)).toEqual({
      rowClassName: "is-unread",
      titleClassName: "is-unread",
      unreadDotClassName: "is-unread",
      showUnreadDot: true,
    })

    expect(getRemoteEntryReadVisualState(true)).toEqual({
      rowClassName: "is-read",
      titleClassName: "is-read",
      unreadDotClassName: "is-read",
      showUnreadDot: false,
    })
  })

  it("does not auto-open the first entry on startup", () => {
    expect(getRemotePreferredEntrySelection(null, ["entry_1", "entry_2"], false)).toBe(null)
    expect(getRemotePreferredEntrySelection("entry_2", ["entry_1", "entry_2"], false)).toBe(
      "entry_2",
    )
    expect(
      getRemotePreferredEntrySelection("entry_2", ["entry_1", "entry_3"], false, [
        "entry_1",
        "entry_2",
        "entry_3",
      ]),
    ).toBe("entry_3")
    expect(getRemotePreferredEntrySelection("entry_3", ["entry_1", "entry_2"], false)).toBe(
      "entry_1",
    )
    expect(getRemotePreferredEntrySelection(null, ["entry_1"], true)).toBe(null)
  })
})
