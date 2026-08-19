import type { Root } from "hast"

import type {
  HtmlParserOptions,
  HtmlParserWorkerRequest,
  HtmlParserWorkerResponse,
} from "./html-parser-types"

type WorkerLike = Pick<Worker, "onerror" | "onmessage" | "postMessage" | "terminate">

type PendingRequest = {
  reject: (error: Error) => void
  resolve: (tree: Root) => void
}

type HtmlParserClientOptions = {
  cacheSize?: number
  workerFactory?: () => WorkerLike
}

const defaultWorkerFactory = (): WorkerLike =>
  new Worker(new URL("./html-parser.worker.ts", import.meta.url), { type: "module" })

export class HtmlParserClient {
  private readonly cache = new Map<string, Root>()
  private readonly cacheSize: number
  private readonly pendingByKey = new Map<string, Promise<Root>>()
  private readonly pendingById = new Map<number, PendingRequest>()
  private readonly workerFactory: () => WorkerLike
  private nextRequestId = 1
  private worker: WorkerLike | null = null
  private workerUnavailable = false

  constructor({
    cacheSize = 20,
    workerFactory = defaultWorkerFactory,
  }: HtmlParserClientOptions = {}) {
    this.cacheSize = Math.max(1, cacheSize)
    this.workerFactory = workerFactory
  }

  parse(content: string, options: HtmlParserOptions = {}): Promise<Root> {
    const key = this.createCacheKey(content, options)
    const cached = this.getCached(content, options)
    if (cached) {
      return Promise.resolve(cached)
    }

    const pending = this.pendingByKey.get(key)
    if (pending) return pending

    const request = this.parseUncached(content, options)
      .then((hastTree) => {
        this.cache.set(key, hastTree)
        while (this.cache.size > this.cacheSize) {
          const oldestKey = this.cache.keys().next().value
          if (oldestKey === undefined) break
          this.cache.delete(oldestKey)
        }
        return hastTree
      })
      .finally(() => {
        this.pendingByKey.delete(key)
      })

    this.pendingByKey.set(key, request)
    return request
  }

  getCached(content: string, options: HtmlParserOptions = {}): Root | undefined {
    const key = this.createCacheKey(content, options)
    const cached = this.cache.get(key)
    if (!cached) return undefined
    this.cache.delete(key)
    this.cache.set(key, cached)
    return cached
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    const error = new Error("HTML parser worker was disposed")
    this.pendingById.forEach(({ reject }) => reject(error))
    this.pendingById.clear()
    this.pendingByKey.clear()
  }

  private async parseUncached(content: string, options: HtmlParserOptions): Promise<Root> {
    const worker = this.getWorker()
    if (!worker) {
      const { parseHtmlToHast } = await import("@suhui/utils/html")
      return parseHtmlToHast(content, options)
    }

    const id = this.nextRequestId++
    const request: HtmlParserWorkerRequest = { id, content, options }
    const result = new Promise<Root>((resolve, reject) => {
      this.pendingById.set(id, { resolve, reject })
    })
    worker.postMessage(request)
    return result
  }

  private getWorker(): WorkerLike | null {
    if (this.workerUnavailable) return null
    if (this.worker) return this.worker

    try {
      const worker = this.workerFactory()
      worker.onmessage = (event: MessageEvent<HtmlParserWorkerResponse>) => {
        const response = event.data
        const pending = this.pendingById.get(response.id)
        if (!pending) return
        this.pendingById.delete(response.id)
        if ("error" in response) {
          pending.reject(new Error(response.error))
        } else {
          pending.resolve(response.hastTree)
        }
      }
      worker.onerror = (event: ErrorEvent) => {
        const error = new Error(event.message || "HTML parser worker failed")
        this.pendingById.forEach(({ reject }) => reject(error))
        this.pendingById.clear()
        worker.terminate()
        this.worker = null
        this.workerUnavailable = true
      }
      this.worker = worker
      return worker
    } catch {
      this.workerUnavailable = true
      return null
    }
  }

  private createCacheKey(content: string, options: HtmlParserOptions) {
    return `${options.renderInlineStyle ? 1 : 0}:${options.noMedia ? 1 : 0}:${content}`
  }
}

export const htmlParserClient = new HtmlParserClient()
