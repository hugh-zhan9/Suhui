import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUserAllMock, upsertManyMock } = vi.hoisted(() => ({
  getUserAllMock: vi.fn(),
  upsertManyMock: vi.fn(),
}))

vi.mock("@suhui/database/services/user", () => ({
  UserService: {
    getUserAll: getUserAllMock,
    upsertMany: upsertManyMock,
    removeCurrentUser: vi.fn().mockResolvedValue(undefined),
    purgeAllForMaintenance: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@suhui/store/context", () => ({
  api: () => ({}),
  authClient: () => ({}),
  queryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }),
}))

import { LOCAL_USER_ID, useUserStore, userSyncService } from "@suhui/store/user/store"

describe("本地用户名持久化", () => {
  beforeEach(() => {
    getUserAllMock.mockReset()
    upsertManyMock.mockReset()
    upsertManyMock.mockResolvedValue(undefined)
    useUserStore.setState({ users: {}, whoami: null, role: null, roleEndAt: null })
  })

  it("内存未 hydrate 时从库里读回已保存的名字，而不是回退成 Local User", async () => {
    getUserAllMock.mockResolvedValue([
      { id: LOCAL_USER_ID, name: "老张", handle: "laozhang", email: "", image: null, isMe: true },
    ])

    const res = await userSyncService.whoami()

    expect(getUserAllMock).toHaveBeenCalled()
    expect(res.user.name).toBe("老张")
  })

  it("不会把回退名写回数据库覆盖已保存的资料", async () => {
    getUserAllMock.mockResolvedValue([
      { id: LOCAL_USER_ID, name: "老张", handle: null, email: "", image: null, isMe: true },
    ])

    await userSyncService.whoami()

    const written = upsertManyMock.mock.calls.flat(2) as Array<{ id: string; name?: string }>
    const localWrite = written.find((user) => user?.id === LOCAL_USER_ID)
    expect(localWrite?.name).toBe("老张")
    expect(localWrite?.name).not.toBe("Local User")
  })

  it("库里确实没有记录时才回退成 Local User", async () => {
    getUserAllMock.mockResolvedValue([])

    const res = await userSyncService.whoami()

    expect(res.user.name).toBe("Local User")
  })

  it("内存已有资料时不再查库", async () => {
    useUserStore.setState({
      users: { [LOCAL_USER_ID]: { id: LOCAL_USER_ID, name: "内存里的名字" } as any },
      whoami: null,
      role: null,
      roleEndAt: null,
    })

    const res = await userSyncService.whoami()

    expect(getUserAllMock).not.toHaveBeenCalled()
    expect(res.user.name).toBe("内存里的名字")
  })
})
