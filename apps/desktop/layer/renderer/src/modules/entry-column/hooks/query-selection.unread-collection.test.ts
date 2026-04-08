import { describe, expect, it } from "vitest"

import * as querySelection from "./query-selection"

const { shouldFilterUnreadEntries } = querySelection

describe("query selection unread filter", () => {
  it("收藏页应忽略 unreadOnly 过滤，始终展示全部收藏", () => {
    expect(shouldFilterUnreadEntries({ isCollection: true, unreadOnly: true })).toBe(false)
  })

  it("非收藏页在 unreadOnly=true 时应启用未读过滤", () => {
    expect(shouldFilterUnreadEntries({ isCollection: false, unreadOnly: true })).toBe(true)
  })

  it("Unread only 下应保留当前激活且刚标为已读的文章", () => {
    expect(
      querySelection.shouldIncludeEntryInUnreadOnly?.({
        isCollection: false,
        unreadOnly: true,
        entryId: "entry_1",
        activeEntryId: "entry_1",
        read: true,
      }),
    ).toBe(true)
  })

  it("切换到别的文章后，旧的已读文章应从未读列表消失", () => {
    expect(
      querySelection.shouldIncludeEntryInUnreadOnly?.({
        isCollection: false,
        unreadOnly: true,
        entryId: "entry_1",
        activeEntryId: "entry_2",
        read: true,
      }),
    ).toBe(false)
  })
})
