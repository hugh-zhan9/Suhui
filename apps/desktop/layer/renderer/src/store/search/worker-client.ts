import type {
  EntrySearchItem,
  SearchDocument,
  SearchWorkerRequest,
  SearchWorkerResponse,
  SearchScope,
} from "./entry-index"

type WorkerLike = Pick<Worker, "onmessage" | "onerror" | "postMessage" | "terminate">

export class SearchWorkerClient {
  private sequence = 0
  private stopped = false
  private pending = new Map<
    number,
    {
      resolve: (items: EntrySearchItem[]) => void
      reject: (error: Error) => void
    }
  >()

  constructor(
    private worker: WorkerLike = new Worker(new URL("./search.worker.ts", import.meta.url), {
      type: "module",
    }),
  ) {
    worker.onmessage = ({ data }: MessageEvent<SearchWorkerResponse>) => {
      const request = this.pending.get(data.id)
      if (!request) return
      this.pending.delete(data.id)
      if (data.error) request.reject(new Error(data.error))
      else request.resolve(data.items ?? [])
    }
    worker.onerror = (event) => this.dispose(new Error(event.message || "搜索线程启动失败"))
  }

  add(documents: SearchDocument[]) {
    return this.request({ id: ++this.sequence, type: "add", documents })
  }

  search(keyword: string, scope: SearchScope = "all", activeFeedIds?: string[]) {
    return this.request({ id: ++this.sequence, type: "search", keyword, scope, activeFeedIds })
  }

  dispose(error = new Error("Search closed")) {
    if (this.stopped) return
    this.stopped = true
    this.worker.terminate()
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
  }

  private request(message: SearchWorkerRequest): Promise<EntrySearchItem[]> {
    if (this.stopped) return Promise.reject(new Error("Search closed"))
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject })
      try {
        this.worker.postMessage(message)
      } catch (error) {
        this.pending.delete(message.id)
        reject(error)
      }
    })
  }
}
