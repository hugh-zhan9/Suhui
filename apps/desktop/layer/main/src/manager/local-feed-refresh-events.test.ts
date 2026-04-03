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

describe("collectSuccessfulLocalRefreshFeedIds", () => {
  it("returns only successful unique feed ids", () => {
    expect(
      collectSuccessfulLocalRefreshFeedIds({
        results: [
          { feedId: "feed_1", ok: true },
          { feedId: "feed_2", ok: false },
          { feedId: "feed_3", ok: true },
          { feedId: "feed_1", ok: true },
          { feedId: "", ok: true },
        ],
      }),
    ).toEqual(["feed_1", "feed_3"])
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

    broadcastLocalFeedRefreshCompleted({
      source: "interval-auto",
      result: {
        refreshed: 2,
        failed: 1,
        results: [
          { feedId: "feed_1", ok: true },
          { feedId: "feed_2", ok: false },
          { feedId: "feed_3", ok: true },
        ],
      },
    })

    expect(sendA).toHaveBeenCalledWith(LOCAL_FEED_REFRESH_COMPLETED_CHANNEL, {
      source: "interval-auto",
      refreshed: 2,
      failed: 1,
      feedIds: ["feed_1", "feed_3"],
    })
    expect(sendB).toHaveBeenCalledWith(LOCAL_FEED_REFRESH_COMPLETED_CHANNEL, {
      source: "interval-auto",
      refreshed: 2,
      failed: 1,
      feedIds: ["feed_1", "feed_3"],
    })
  })

  it("skips broadcasting when there are no successful feeds", () => {
    const send = vi.fn()
    getAllWindows.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: { send },
      },
    ])

    broadcastLocalFeedRefreshCompleted({
      source: "startup-auto",
      result: {
        refreshed: 0,
        failed: 1,
        results: [{ feedId: "feed_1", ok: false }],
      },
    })

    expect(send).not.toHaveBeenCalled()
  })
})
