import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAllWindows } = vi.hoisted(() => ({
  getAllWindows: vi.fn(),
}))

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows,
  },
}))

import {
  LOCAL_FEED_REFRESH_COMPLETED_CHANNEL,
  broadcastLocalFeedRefreshCompleted,
  collectSuccessfulLocalRefreshFeedIds,
} from "./local-feed-refresh-events"
import { createEntryChangeEventV1, parseEntryChangeEventV1 } from "@suhui/shared/entry-change"

describe("collectSuccessfulLocalRefreshFeedIds", () => {
  it("returns only successful unique feed ids", () => {
    expect(
      collectSuccessfulLocalRefreshFeedIds({
        results: [
          { feedId: "feed_1", ok: true },
          { feedId: "feed_2", ok: false },
          { feedId: "feed_3", ok: true },
          { feedId: "feed_1", ok: true },
          { feedId: " feed_4 ", ok: true },
          { feedId: "", ok: true },
        ],
      }),
    ).toEqual(["feed_1", "feed_3", "feed_4"])
  })
})

describe("EntryChangeEventV1", () => {
  it("normalizes identifiers and strips unknown or private payload fields", () => {
    const parsed = parseEntryChangeEventV1({
      version: 1,
      batchId: " batch_1 ",
      reason: "refresh",
      source: "startup-auto",
      scope: "feeds",
      feedIds: [" feed_1 ", "feed_1", "", "feed_2"],
      entryIds: [" entry_1 ", "entry_1"],
      refreshed: 2,
      failed: 0,
      completedAt: 123,
      content: "private body",
      title: "private title",
      url: "https://example.com/private?token=secret",
      sqlParameters: ["secret"],
      connectionString: "postgres://secret",
      localPath: "/Users/private",
    })

    expect(parsed).toEqual({
      version: 1,
      batchId: "batch_1",
      reason: "refresh",
      source: "startup-auto",
      scope: "feeds",
      feedIds: ["feed_1", "feed_2"],
      entryIds: ["entry_1"],
      refreshed: 2,
      failed: 0,
      completedAt: 123,
    })
    expect(JSON.stringify(parsed)).not.toMatch(
      /private body|private title|token=secret|sqlParameters|connectionString|localPath/,
    )
  })

  it("rejects invalid schemas while allowing a zero-success refresh response", () => {
    expect(
      parseEntryChangeEventV1({
        version: 1,
        batchId: "batch_1",
        reason: "read",
        source: "remote",
        scope: "feeds",
        feedIds: [],
        completedAt: 123,
      }),
    ).toBeNull()

    expect(
      createEntryChangeEventV1({
        batchId: "batch_2",
        reason: "refresh",
        source: "startup-auto",
        scope: "feeds",
        feedIds: [],
        refreshed: 0,
        failed: 1,
        completedAt: 124,
      }),
    ).toMatchObject({ version: 1, batchId: "batch_2", feedIds: [] })
  })
})

describe("broadcastLocalFeedRefreshCompleted", () => {
  beforeEach(() => {
    getAllWindows.mockReset()
  })

  it("broadcasts successful feed ids to every live window", () => {
    const sendA = vi.fn()
    const sendB = vi.fn()
    getAllWindows.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: { send: sendA },
      },
      {
        isDestroyed: () => true,
        webContents: { send: vi.fn() },
      },
      {
        isDestroyed: () => false,
        webContents: { send: sendB },
      },
    ])

    const changeSet = createEntryChangeEventV1({
      batchId: "batch_1",
      reason: "refresh",
      source: "interval-auto",
      scope: "feeds",
      refreshed: 2,
      failed: 1,
      feedIds: ["feed_1", "feed_3"],
      completedAt: 123,
    })
    const eventCount = broadcastLocalFeedRefreshCompleted(changeSet)

    expect(eventCount).toBe(1)
    expect(sendA).toHaveBeenCalledWith(LOCAL_FEED_REFRESH_COMPLETED_CHANNEL, changeSet)
    expect(sendB).toHaveBeenCalledWith(LOCAL_FEED_REFRESH_COMPLETED_CHANNEL, changeSet)
  })

  it("skips broadcasting when there are no successful feeds", () => {
    const send = vi.fn()
    getAllWindows.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: { send },
      },
    ])

    const eventCount = broadcastLocalFeedRefreshCompleted({
      version: 1,
      batchId: "batch_1",
      reason: "refresh",
      source: "startup-auto",
      scope: "feeds",
      refreshed: 0,
      failed: 1,
      feedIds: [],
      completedAt: 123,
    })

    expect(eventCount).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it.each([1, 10, 50])("emits exactly one sanitized metric for a %i-feed batch", (count) => {
    const send = vi.fn()
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    getAllWindows.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: { send },
      },
    ])
    const changeSet = createEntryChangeEventV1({
      batchId: `batch_${count}`,
      reason: "refresh",
      source: "performance-harness",
      scope: "feeds",
      refreshed: count,
      failed: 0,
      feedIds: Array.from({ length: count }, (_, index) => `feed_${index}`),
      completedAt: 123,
    })

    expect(broadcastLocalFeedRefreshCompleted(changeSet)).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith(
      "[PerformanceMetric]",
      JSON.stringify({
        metric: "refresh_batch_event_count",
        batchId: `batch_${count}`,
        value: 1,
      }),
    )
    info.mockRestore()
  })
})
