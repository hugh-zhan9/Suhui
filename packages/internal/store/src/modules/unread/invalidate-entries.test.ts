import { describe, expect, it, vi } from "vitest"

import { invalidateEntriesForUnreadMutation } from "./invalidate-entries"

const { handleChangeMock, invalidateQueriesMock } = vi.hoisted(() => ({
  handleChangeMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}))

vi.mock("../../context", () => ({
  queryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock("../entry/change-invalidation", () => ({
  entryChangeInvalidationCoordinator: {
    handle: handleChangeMock,
  },
}))

describe("invalidateEntriesForUnreadMutation", () => {
  it("delegates unread-only calibration to reason=read with the affected entry IDs", async () => {
    handleChangeMock.mockResolvedValueOnce("handled")

    await Reflect.apply(invalidateEntriesForUnreadMutation, undefined, [
      [" entry-1 ", "entry-1", "", "entry-2"],
    ])

    expect(handleChangeMock).toHaveBeenCalledOnce()
    expect(handleChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        batchId: expect.any(String),
        reason: "read",
        source: "unread-mutation",
        scope: "all",
        feedIds: [],
        entryIds: ["entry-1", "entry-2"],
        completedAt: expect.any(Number),
      }),
      "response",
    )
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })
})
