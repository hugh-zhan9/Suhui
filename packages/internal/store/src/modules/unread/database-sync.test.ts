import { UnreadService } from "@suhui/database/services/unread"
import { afterEach, describe, expect, it, vi } from "vitest"
import { unreadActions, useUnreadStore } from "./store"

afterEach(() => {
  vi.restoreAllMocks()
  useUnreadStore.setState({ data: {} })
})
describe("database unread calibration", () => {
  it("replaces cached counts, including a source becoming fully read or unsubscribed", async () => {
    useUnreadStore.setState({ data: { feed: 99, removed: 80 } })
    vi.spyOn(UnreadService, "getUnreadAll").mockResolvedValue([
      { id: "feed", count: 0 },
      { id: "unopened", count: 37 },
    ])
    await unreadActions.refreshFromDatabase()
    expect(useUnreadStore.getState().data).toEqual({ feed: 0, unopened: 37 })
  })
  it("keeps an optimistic read change made while the query is in flight", async () => {
    useUnreadStore.setState({ data: { feed: 10 } })
    let complete!: (rows: { id: string; count: number }[]) => void
    vi.spyOn(UnreadService, "getUnreadAll").mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const refresh = unreadActions.refreshFromDatabase()
    unreadActions.upsertManyInSession([{ id: "feed", count: 9 }])
    complete([
      { id: "feed", count: 10 },
      { id: "unopened", count: 37 },
    ])
    await refresh
    expect(useUnreadStore.getState().data).toEqual({ feed: 9, unopened: 37 })
  })
})
