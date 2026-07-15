import type { FeedSchema } from "@suhui/database/schemas/types"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { resetHydratePhases, startHydrateInteractive } from "../../hydrate-phases"
import { feedActions, useFeedStore } from "./store"

const makeFeed = (id: string, title: string): FeedSchema =>
  ({
    id,
    title,
    url: `https://example.com/${id}.xml`,
  }) as FeedSchema

describe("feed snapshot restore", () => {
  beforeEach(() => {
    useFeedStore.setState({ feeds: {} })
    resetHydratePhases()
  })

  afterEach(() => {
    useFeedStore.setState({ feeds: {} })
    resetHydratePhases()
  })

  it("replaces stale feeds while reconciling a retained feed by id", () => {
    feedActions.upsertManyInSession([
      makeFeed("stale-feed", "Stale feed"),
      makeFeed("retained-feed", "Original retained title"),
    ])
    startHydrateInteractive()
    feedActions.patchInSession("retained-feed", { title: "Locally edited title" })

    const snapshot = [
      makeFeed("retained-feed", "Snapshot retained title"),
      makeFeed("new-feed", "New feed"),
    ]
    feedActions.restoreHydratedSnapshotInSession(snapshot)

    const feeds = useFeedStore.getState().feeds
    expect(Object.keys(feeds)).toEqual(["retained-feed", "new-feed"])
    expect(Object.keys(feeds)).toHaveLength(snapshot.length)
    expect(feeds["stale-feed"]).toBeUndefined()
    expect(feeds["retained-feed"]?.title).toBe("Locally edited title")
    expect(feeds["new-feed"]?.title).toBe("New feed")
  })
})
