import { describe, expect, it, vi } from "vitest"

import { SearchWorkerClient } from "./worker-client"

describe("search worker lifecycle", () => {
  const createWorker = () =>
    ({
      onmessage: null,
      onerror: null,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    }) as unknown as Worker

  it("pairs responses with requests and releases all pending callers on close", async () => {
    const worker = createWorker()
    const client = new SearchWorkerClient(worker)
    const first = client.search("first")
    const second = client.search("second")
    const closed = expect(first).rejects.toThrow("Search closed")
    worker.onmessage!({
      data: { id: 2, items: [{ id: "second", feedId: "feed", title: "Second" }] },
    } as MessageEvent)
    expect(await second).toHaveLength(1)
    client.dispose()
    await closed
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    await expect(client.search("after close")).rejects.toThrow("Search closed")
  })

  it("reports worker startup errors instead of falling back to blocking the UI", async () => {
    const worker = createWorker()
    const client = new SearchWorkerClient(worker)
    const pending = expect(client.add([])).rejects.toThrow("worker failed")
    worker.onerror!({ message: "worker failed" } as ErrorEvent)
    await pending
    expect(worker.terminate).toHaveBeenCalled()
  })
})
