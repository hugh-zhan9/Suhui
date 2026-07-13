import { describe, expect, it } from "vitest"

type DeferredRequest = {
  promise: Promise<void>
  resolve: () => void
}

const deferredDetailRequests = () => {
  const requests = new Map<string, DeferredRequest>()
  const started: string[] = []
  const load = (id: string) => {
    started.push(id)
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
      resolve = done
    })
    requests.set(id, { promise, resolve })
    return promise
  }
  return {
    load,
    resolve: (id: string) => requests.get(id)?.resolve(),
    flush: async () => {
      await Promise.resolve()
      await Promise.resolve()
    },
    startedIds: () => started,
  }
}

const insufficientVideo = (id: string) => ({
  id,
  recordKind: "summary" as const,
  url: null,
  attachments: null,
  media: null,
  description: null,
})

describe("createVisibleDetailPrefetchQueue", () => {
  it("starts at most four visible detail requests and releases the fifth after a slot opens", async () => {
    const { createVisibleDetailPrefetchQueue } = await import("./visible-detail-prefetch")
    const requests = deferredDetailRequests()
    const queue = createVisibleDetailPrefetchQueue({ concurrency: 4, loadDetail: requests.load })
    queue.syncVisibleRows(["e1", "e2", "e3", "e4", "e5"].map(insufficientVideo))
    expect(requests.startedIds()).toEqual(["e1", "e2", "e3", "e4"])
    expect(queue.maxObservedConcurrency()).toBe(4)

    requests.resolve("e1")
    await requests.flush()
    expect(requests.startedIds()).toEqual(["e1", "e2", "e3", "e4", "e5"])
  })

  it("cancels queued detail work when a row leaves the visible set", async () => {
    const { createVisibleDetailPrefetchQueue } = await import("./visible-detail-prefetch")
    const requests = deferredDetailRequests()
    const queue = createVisibleDetailPrefetchQueue({ concurrency: 4, loadDetail: requests.load })
    queue.syncVisibleRows(["e1", "e2", "e3", "e4", "offscreen"].map(insufficientVideo))
    expect(requests.startedIds()).not.toContain("offscreen")

    queue.syncVisibleRows(["e1", "e2", "e3", "e4"].map(insufficientVideo))
    requests.resolve("e1")
    await requests.flush()
    expect(requests.startedIds()).not.toContain("offscreen")
  })

  it("does not request detail when summary media fields are sufficient", async () => {
    const { createVisibleDetailPrefetchQueue } = await import("./visible-detail-prefetch")
    const requests = deferredDetailRequests()
    const queue = createVisibleDetailPrefetchQueue({ concurrency: 4, loadDetail: requests.load })
    queue.syncVisibleRows([
      { ...insufficientVideo("media"), media: [{ type: "video", url: "https://cdn/video.mp4" }] },
      {
        ...insufficientVideo("attachment"),
        attachments: [{ url: "https://player.example/embed/1", mime_type: "text/html" }],
      },
      { ...insufficientVideo("url"), url: "https://www.youtube.com/watch?v=abc" },
    ])

    expect(requests.startedIds()).toEqual([])
  })

  it("requests detail for attachment and description values the renderer cannot derive", async () => {
    const { createVisibleDetailPrefetchQueue } = await import("./visible-detail-prefetch")
    const requests = deferredDetailRequests()
    const queue = createVisibleDetailPrefetchQueue({ concurrency: 4, loadDetail: requests.load })
    queue.syncVisibleRows([
      {
        ...insufficientVideo("image-attachment"),
        attachments: [{ url: "https://cdn/image.jpg", mime_type: "image/jpeg" }],
      },
      {
        ...insufficientVideo("description-only"),
        description: "Watch https://www.youtube.com/watch?v=abc",
      },
    ])

    expect(requests.startedIds()).toEqual(["image-attachment", "description-only"])
  })

  it("keeps the shared visible-row set when one mounted video row leaves", async () => {
    const module = await import("./visible-detail-prefetch")
    expect(module).toHaveProperty("createVisibleDetailPrefetchRegistry")
    const snapshots: string[][] = []
    const registry = (module as any).createVisibleDetailPrefetchRegistry({
      syncVisibleRows: (rows: Array<{ id: string }>) => snapshots.push(rows.map((row) => row.id)),
    })

    const unregisterE1 = registry.register(insufficientVideo("e1"))
    registry.register(insufficientVideo("e2"))
    unregisterE1()

    expect(snapshots).toEqual([["e1"], ["e1", "e2"], ["e2"]])
  })
})
