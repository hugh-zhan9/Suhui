import type { Root } from "hast"
import { describe, expect, it, vi } from "vitest"

import { HtmlParserClient } from "./html-parser-client"

const tree = (value: string): Root => ({
  type: "root",
  children: [{ type: "text", value }],
})

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage = vi.fn((request: { id: number; content: string }) => {
    queueMicrotask(() => {
      this.onmessage?.({
        data: { id: request.id, hastTree: tree(request.content) },
      } as MessageEvent)
    })
  })
  terminate = vi.fn()
}

describe("HtmlParserClient", () => {
  it("parses rich content through a worker and deduplicates cached requests", async () => {
    const worker = new FakeWorker()
    const client = new HtmlParserClient({
      workerFactory: () => worker,
      cacheSize: 2,
    })

    const first = client.parse("<p>text<img src='x'></p>", { noMedia: false })
    const duplicate = client.parse("<p>text<img src='x'></p>", { noMedia: false })

    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    await expect(first).resolves.toEqual(tree("<p>text<img src='x'></p>"))
    await expect(duplicate).resolves.toEqual(tree("<p>text<img src='x'></p>"))

    await client.parse("<a href='https://example.com'>link</a>", { noMedia: false })
    await client.parse("<p>third</p>", { noMedia: false })
    await client.parse("<p>text<img src='x'></p>", { noMedia: false })

    expect(worker.postMessage).toHaveBeenCalledTimes(4)
  })
})
