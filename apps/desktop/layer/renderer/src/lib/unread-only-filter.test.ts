import { beforeEach, describe, expect, it, vi } from "vitest"

import { entrySyncServices } from "@follow/store/entry/store"

const makeRow = (id: string, read: boolean) => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
  content: null,
  readabilityContent: null,
  readabilityUpdatedAt: null,
  description: id,
  guid: id,
  author: null,
  authorUrl: null,
  authorAvatar: null,
  insertedAt: new Date("2026-02-26T00:00:00.000Z"),
  publishedAt: new Date("2026-02-26T00:00:00.000Z"),
  media: null,
  categories: null,
  attachments: null,
  extra: null,
  language: null,
  feedId: "feed-1",
  inboxHandle: null,
  read,
  sources: null,
  settings: null,
})

describe("entry fetch unread filter", () => {
  beforeEach(() => {
    ;(globalThis as any).window = {
      electron: {
        ipcRenderer: {
          invoke: vi.fn().mockResolvedValue([makeRow("read", true), makeRow("unread", false)]),
        },
      },
    }
  })

  it("read=false 时应只返回未读条目", async () => {
    const result = await entrySyncServices.fetchEntries({ read: false } as any)
    const ids = result.data.map((d: any) => d.entries.id)
    expect(ids).toEqual(["unread"])
  })
})
