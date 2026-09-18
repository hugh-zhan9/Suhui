import { beforeEach, describe, expect, it, vi } from "vitest"

import { useRepairFeed } from "./useRepairFeed"

const mocks = vi.hoisted(() => ({
  desktop: true,
  connected: true,
  repairFeed: vi.fn(),
  getFeedAll: vi.fn(),
  upsertManyInSession: vi.fn(),
  resetFromRemote: vi.fn(),
  invalidateQueries: vi.fn(),
  options: null as null | { mutationFn: () => Promise<unknown> },
}))

vi.mock("@suhui/shared/constants", () => ({
  get IN_ELECTRON() {
    return mocks.desktop
  },
}))
vi.mock("~/lib/client", () => ({
  get ipcServices() {
    return mocks.connected ? { db: { repairFeed: mocks.repairFeed } } : null
  },
}))
vi.mock("@suhui/database/services/feed", () => ({ FeedService: { getFeedAll: mocks.getFeedAll } }))
vi.mock("@suhui/store/feed/store", () => ({
  feedActions: { upsertManyInSession: mocks.upsertManyInSession },
}))
vi.mock("@suhui/store/unread/store", () => ({
  unreadSyncService: { resetFromRemote: mocks.resetFromRemote },
}))
vi.mock("~/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.invalidateQueries })),
  useIsMutating: vi.fn(() => 0),
  useMutation: vi.fn((options) => {
    mocks.options = options
    return { mutate: vi.fn() }
  }),
}))

describe("repair feed IPC availability", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.desktop = true
    mocks.connected = true
    mocks.getFeedAll.mockResolvedValue([{ id: "feed-1" }])
  })

  it.each([
    [false, true],
    [true, false],
  ])(
    "rejects when desktop=%s and IPC=%s before updating local state",
    async (desktop, connected) => {
      mocks.desktop = desktop
      mocks.connected = connected
      useRepairFeed("feed-1")
      await expect(mocks.options!.mutationFn()).rejects.toThrow("请在桌面应用中重新查找订阅源")
      expect(mocks.repairFeed).not.toHaveBeenCalled()
      expect(mocks.getFeedAll).not.toHaveBeenCalled()
    },
  )

  it("repairs through IPC and refreshes feed, unread and entry state", async () => {
    const result = {
      previousUrl: "https://example.com/rss",
      url: "https://example.com/feed",
      added: 2,
    }
    mocks.repairFeed.mockResolvedValue(result)
    useRepairFeed("feed-1")
    await expect(mocks.options!.mutationFn()).resolves.toBe(result)
    expect(mocks.repairFeed).toHaveBeenCalledWith("feed-1")
    expect(mocks.upsertManyInSession).toHaveBeenCalledWith([{ id: "feed-1", type: "feed" }])
    expect(mocks.resetFromRemote).toHaveBeenCalledOnce()
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["entries"] })
  })

  it("preserves a failed repair without synchronizing success state", async () => {
    mocks.repairFeed.mockRejectedValue(new Error("Feed discovery failed"))
    useRepairFeed("feed-1")
    await expect(mocks.options!.mutationFn()).rejects.toThrow("Feed discovery failed")
    expect(mocks.getFeedAll).not.toHaveBeenCalled()
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
  })
})
