import { describe, expect, it, vi } from "vitest"

import { invalidateEntriesForUnreadMutation } from "./invalidate-entries"

const invalidateQueriesMock = vi.fn()

vi.mock("../../context", () => ({
  queryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

describe("invalidateEntriesForUnreadMutation", () => {
  it("应触发 entries 查询失效，确保 unreadOnly 视图立即刷新", async () => {
    await invalidateEntriesForUnreadMutation()
    expect(invalidateQueriesMock).toHaveBeenCalledOnce()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["entries"],
    })
  })
})
