import { describe, expect, it } from "vitest"

import { countUnreadBySourceId, countUnreadBySourceIds, sortSourceIdsByUnread } from "./unread-by-source"

describe("unread by source", () => {
  const state = {
    data: {
      e1: { id: "e1", read: false },
      e2: { id: "e2", read: true },
      e3: { id: "e3", read: false },
      e4: { id: "e4", read: false },
    },
    entryIdByFeed: {
      f1: new Set(["e1", "e2"]),
      f2: new Set(["e3"]),
    },
    entryIdByInbox: {
      inbox_1: new Set(["e4"]),
    },
    entryIdByList: {
      list_1: new Set(["e1", "e3", "e4"]),
    },
  } as const

  it("按 feed/inbox/list source id 统计未读", () => {
    expect(countUnreadBySourceId(state as any, "f1")).toBe(1)
    expect(countUnreadBySourceId(state as any, "inbox_1")).toBe(1)
    expect(countUnreadBySourceId(state as any, "list_1")).toBe(3)
  })

  it("批量 source 统计可累加", () => {
    expect(countUnreadBySourceIds(state as any, ["f1", "f2"])).toBe(2)
  })

  it("可按未读数排序 source id", () => {
    const sorted = sortSourceIdsByUnread(state as any, ["f1", "f2", "inbox_1"], true)
    expect(sorted[0]).toBe("f1")
  })
})

