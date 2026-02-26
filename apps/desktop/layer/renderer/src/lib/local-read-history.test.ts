import { beforeEach, describe, expect, it, vi } from "vitest"

const { readHistoriesMock } = vi.hoisted(() => ({
  readHistoriesMock: vi.fn(),
}))

vi.mock("@follow/store/context", () => ({
  api: () => ({
    entries: {
      readHistories: readHistoriesMock,
    },
  }),
}))

import { entrySyncServices } from "@follow/store/entry/store"

describe("local read history", () => {
  beforeEach(() => {
    readHistoriesMock.mockReset()
    readHistoriesMock.mockRejectedValue(new Error("should not call remote api"))
  })

  it("本地模式读取历史不应请求远端接口", async () => {
    const result = await entrySyncServices.fetchEntryReadHistory("local_entry_1", 20)

    expect(readHistoriesMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      entryReadHistories: { userIds: [] },
      total: 0,
      users: {},
    })
  })
})
