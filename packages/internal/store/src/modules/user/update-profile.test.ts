import { beforeEach, describe, expect, it, vi } from "vitest"

const userServiceMocks = vi.hoisted(() => ({
  upsertMany: vi.fn(),
}))

vi.mock("@suhui/database/services/user", () => ({
  UserService: {
    getUserAll: vi.fn(async () => []),
    purgeAllForMaintenance: vi.fn(async () => undefined),
    removeCurrentUser: vi.fn(async () => undefined),
    upsertMany: userServiceMocks.upsertMany,
  },
}))

import { LOCAL_USER_ID, userSyncService, useUserStore } from "./store"

describe("local profile persistence", () => {
  beforeEach(() => {
    userServiceMocks.upsertMany.mockReset()
    useUserStore.setState({
      users: {},
      whoami: {
        id: LOCAL_USER_ID,
        name: "Local User",
        email: "",
      } as any,
    })
  })

  it("does not report success until the profile is persisted", async () => {
    let finishPersistence: (() => void) | undefined
    userServiceMocks.upsertMany.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishPersistence = resolve
        }),
    )

    let updateFinished = false
    const updatePromise = userSyncService.updateProfile({ name: "Alice Local" }).then(() => {
      updateFinished = true
    })

    await vi.waitFor(() => expect(userServiceMocks.upsertMany).toHaveBeenCalledTimes(1))
    const finishedBeforePersistence = updateFinished

    finishPersistence?.()
    await updatePromise

    expect(finishedBeforePersistence).toBe(false)
    expect(useUserStore.getState().whoami?.name).toBe("Alice Local")
  })
})
