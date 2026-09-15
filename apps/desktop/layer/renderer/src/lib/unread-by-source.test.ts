import { describe, expect, it } from "vitest"

import {
  countUnreadBySourceId,
  countUnreadBySourceIds,
  sortSourceIdsByUnread,
} from "./unread-by-source"

describe("unread by source", () => {
  const state = { data: { f1: 1, f2: 1, inbox_1: 1, list_1: 3 } }

  it("按 feed/inbox/list source id 统计未读", () => {
    expect(countUnreadBySourceId(state as any, "f1")).toBe(1)
    expect(countUnreadBySourceId(state as any, "inbox_1")).toBe(1)
    expect(countUnreadBySourceId(state as any, "list_1")).toBe(3)
  })

  it("批量 source 统计可累加", () => {
    expect(countUnreadBySourceIds(state as any, ["f1", "f2", "f1"])).toBe(2)
  })

  it("可按未读数排序 source id", () => {
    const sorted = sortSourceIdsByUnread(state as any, ["f1", "f2", "inbox_1"], true)
    expect(sorted[0]).toBe("f1")
  })
})
