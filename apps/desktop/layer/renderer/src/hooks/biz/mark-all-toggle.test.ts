import { describe, expect, it } from "vitest"

import { resolveMarkAllToggleAction } from "./mark-all-toggle"

describe("resolveMarkAllToggleAction", () => {
  it("有未读时应展示全部标记已读", () => {
    expect(resolveMarkAllToggleAction(3)).toEqual({
      labelKey: "sidebar.feed_actions.mark_all_as_read",
      shouldMarkAsRead: true,
    })
  })

  it("已全部读完时应展示全部标记未读", () => {
    expect(resolveMarkAllToggleAction(0)).toEqual({
      labelKey: "sidebar.feed_actions.mark_all_as_unread",
      shouldMarkAsRead: false,
    })
  })
})
