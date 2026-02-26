import { beforeEach, describe, expect, it, vi } from "vitest"

const { getFlattenMapEntriesMock, markReadMock } = vi.hoisted(() => ({
  getFlattenMapEntriesMock: vi.fn(),
  markReadMock: vi.fn(),
}))

vi.mock("@follow/store/entry/store", () => ({
  entryActions: {
    getFlattenMapEntries: getFlattenMapEntriesMock,
  },
}))

vi.mock("@follow/store/unread/store", () => ({
  unreadSyncService: {
    markRead: markReadMock,
  },
}))

import { batchMarkRead } from "./useEntryMarkReadHandler"

describe("batchMarkRead", () => {
  beforeEach(() => {
    getFlattenMapEntriesMock.mockReset()
    markReadMock.mockReset()
  })

  it("只对未读且可标记来源(feed/inbox)的条目触发统一 markRead", () => {
    getFlattenMapEntriesMock.mockReturnValue({
      a: { id: "a", read: false, feedId: "feed-a" },
      b: { id: "b", read: false, inboxHandle: "inbox-b" },
      c: { id: "c", read: true, feedId: "feed-c" },
      d: { id: "d", read: false },
    })

    batchMarkRead(["a", "b", "c", "d", "missing"])

    expect(markReadMock).toHaveBeenCalledTimes(2)
    expect(markReadMock).toHaveBeenNthCalledWith(1, "a")
    expect(markReadMock).toHaveBeenNthCalledWith(2, "b")
  })

  it("重复 id 只触发一次", () => {
    getFlattenMapEntriesMock.mockReturnValue({
      a: { id: "a", read: false, feedId: "feed-a" },
    })

    batchMarkRead(["a", "a", "a"])

    expect(markReadMock).toHaveBeenCalledTimes(1)
    expect(markReadMock).toHaveBeenCalledWith("a")
  })
})
