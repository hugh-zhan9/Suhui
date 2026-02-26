import { FeedViewType } from "@follow/constants"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { remoteCollectionPostMock, remoteCollectionDeleteMock } = vi.hoisted(() => ({
  remoteCollectionPostMock: vi.fn(),
  remoteCollectionDeleteMock: vi.fn(),
}))

vi.mock("@follow/store/context", () => ({
  api: () => ({
    collections: {
      post: remoteCollectionPostMock,
      delete: remoteCollectionDeleteMock,
    },
  }),
  queryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock("@follow/database/services/collection", () => ({
  CollectionService: {
    upsertMany: vi.fn().mockResolvedValue(undefined),
    deleteMany: vi.fn().mockResolvedValue(undefined),
    getCollectionAll: vi.fn().mockResolvedValue([]),
    reset: vi.fn().mockResolvedValue(undefined),
  },
}))

import { collectionSyncService, useCollectionStore } from "@follow/store/collection/store"
import { entryActions } from "@follow/store/entry/store"

const makeEntry = (id: string) => ({
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
  read: false,
  sources: null,
  settings: null,
})

describe("collection local mode", () => {
  beforeEach(() => {
    ;(globalThis as any).window = { electron: { ipcRenderer: {} } }
    useCollectionStore.setState({ collections: {} })
    entryActions.upsertManyInSession([makeEntry("entry-1")] as any)

    remoteCollectionPostMock.mockReset()
    remoteCollectionDeleteMock.mockReset()
    remoteCollectionPostMock.mockRejectedValue(new Error("should not call remote collections.post"))
    remoteCollectionDeleteMock.mockRejectedValue(
      new Error("should not call remote collections.delete"),
    )
  })

  it("本地模式可收藏且不请求远端", async () => {
    await expect(
      collectionSyncService.starEntry({
        entryId: "entry-1",
        view: FeedViewType.Articles,
      }),
    ).resolves.toBeUndefined()

    expect(useCollectionStore.getState().collections["entry-1"]).toBeTruthy()
    expect(remoteCollectionPostMock).not.toHaveBeenCalled()
  })

  it("本地模式可取消收藏且不请求远端", async () => {
    await collectionSyncService.starEntry({
      entryId: "entry-1",
      view: FeedViewType.Articles,
    })

    await expect(collectionSyncService.unstarEntry({ entryId: "entry-1" })).resolves.toBeUndefined()

    expect(useCollectionStore.getState().collections["entry-1"]).toBeFalsy()
    expect(remoteCollectionDeleteMock).not.toHaveBeenCalled()
  })
})
