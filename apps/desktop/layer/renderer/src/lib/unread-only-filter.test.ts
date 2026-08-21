import { entrySyncServices } from "@suhui/store/entry/store"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 未读过滤已经下沉到主进程 SQL（application/entry/query-builder.ts 的 read 分支，
 * 由 query-service.test.ts 覆盖）。渲染层现在的职责只有两件事：把 read 条件
 * 原样转交给 db.listEntries，并把返回的行映射成 EntryModel。这里钉住的是这个边界。
 */
const makeRow = (id: string, read: boolean) => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
  description: id,
  guid: id,
  insertedAt: new Date("2026-02-26T00:00:00.000Z"),
  publishedAt: new Date("2026-02-26T00:00:00.000Z"),
  feedId: "feed-1",
  read,
})

describe("entry fetch unread filter", () => {
  const invoke = vi.fn()

  beforeEach(() => {
    invoke.mockReset()
    ;(globalThis as any).window = { electron: { ipcRenderer: { invoke } } }
  })

  it("read=false 透传给主进程查询", async () => {
    invoke.mockResolvedValue({
      items: [makeRow("unread", false)],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })

    const result = await entrySyncServices.fetchEntries({ read: false } as any)

    expect(invoke).toHaveBeenCalledWith("db.listEntries", expect.objectContaining({ read: false }))
    expect(result.data.map((entry: any) => entry.id)).toEqual(["unread"])
  })

  it("未指定 read 时不下发该条件", async () => {
    invoke.mockResolvedValue({
      items: [makeRow("read", true), makeRow("unread", false)],
      page: { limit: 20, hasMore: false, nextCursor: null },
    })

    await entrySyncServices.fetchEntries({} as any)

    const query = invoke.mock.calls[0]?.[1] as Record<string, unknown>
    expect(query).not.toHaveProperty("read")
  })
})
