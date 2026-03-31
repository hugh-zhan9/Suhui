import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

import { subscriptionApplicationService } from "~/application/subscription/service"

import { getRemoteClientAsset, getRemoteClientHtml } from "./client"
import { REMOTE_SERVER_DEFAULT_HOST, REMOTE_SERVER_DEFAULT_PORT } from "./config"
import { getRemoteShellHtml, getRemoteShellScript } from "./shell"

type SubscriptionRecord = Awaited<
  ReturnType<typeof subscriptionApplicationService.listSubscriptions>
>[number]

type EntryRecord = any

type RemoteServerDependencies = {
  getSubscriptions: () => Promise<SubscriptionRecord[]>
  getEntries: (feedId?: string) => Promise<EntryRecord[]>
  getUnreadCounts: () => Promise<Array<{ id: string; count: number }>>
  updateReadStatus: (payload: { entryIds: string[]; read: boolean }) => Promise<void>
  refreshFeed: (feedId: string) => Promise<unknown>
  refreshAllFeeds: () => Promise<unknown>
  getRemoteIndexHtml: () => Promise<string | null>
  getRemoteAsset: (
    pathname: string,
  ) => Promise<{ content: Buffer | string; contentType: string } | null>
}

type StartOptions = Partial<{
  host: string
  port: number
}> &
  Partial<RemoteServerDependencies>

type RunningServerStatus = {
  running: true
  host: string
  port: number
  baseUrl: string
}

type StoppedServerStatus = {
  running: false
  host: string | null
  port: number | null
  baseUrl: null
}

type RemoteServerStatus = RunningServerStatus | StoppedServerStatus

type StartResult = RunningServerStatus
type RemoteEventName = "ready" | "ping" | "entries.updated" | "subscriptions.updated"
type RemoteEventPayload = Record<string, unknown>

const json = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.statusCode = statusCode
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.end(JSON.stringify(payload))
}

const text = (
  response: ServerResponse,
  statusCode: number,
  payload: string | Buffer,
  contentType: string,
) => {
  response.statusCode = statusCode
  response.setHeader("Content-Type", contentType)
  response.end(payload)
}

const getBaseUrl = (host: string, port: number) => `http://${host}:${port}`
const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString("utf8")
  return JSON.parse(raw) as T
}

const writeSseEvent = (
  response: ServerResponse<IncomingMessage>,
  event: RemoteEventName,
  payload: RemoteEventPayload,
) => {
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

const createRequestHandler =
  (
    deps: RemoteServerDependencies,
    getStatus: () => RemoteServerStatus,
    onSseConnect: (request: IncomingMessage, response: ServerResponse<IncomingMessage>) => void,
  ) =>
  async (request: IncomingMessage, response: ServerResponse) => {
    const method = request.method || "GET"
    const url = new URL(request.url || "/", "http://127.0.0.1")

    if (method === "GET" && url.pathname === "/health") {
      json(response, 200, { ok: true })
      return
    }

    if (method === "GET" && url.pathname === "/") {
      const remoteHtml = await deps.getRemoteIndexHtml()
      text(response, 200, remoteHtml || getRemoteShellHtml(), "text/html; charset=utf-8")
      return
    }

    if (method === "GET" && url.pathname === "/remote.js") {
      text(response, 200, getRemoteShellScript(), "text/javascript; charset=utf-8")
      return
    }

    if (
      method === "GET" &&
      (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/__remote_dev__/"))
    ) {
      const asset = await deps.getRemoteAsset(url.pathname)
      if (asset) {
        text(response, 200, asset.content, asset.contentType)
        return
      }
    }

    if (method === "GET" && url.pathname === "/events") {
      onSseConnect(request, response)
      return
    }

    if (method === "GET" && url.pathname === "/status") {
      json(response, 200, getStatus())
      return
    }

    if (method === "GET" && url.pathname === "/api/entries") {
      const feedId = url.searchParams.get("feedId") || undefined
      const entries = await deps.getEntries(feedId)
      json(response, 200, { data: entries })
      return
    }

    if (method === "GET" && url.pathname === "/api/unread") {
      const unreadCounts = await deps.getUnreadCounts()
      json(response, 200, { data: unreadCounts })
      return
    }

    if (method === "POST" && url.pathname === "/api/entries/read") {
      const payload = await readJsonBody<{ entryIds: string[]; read: boolean }>(request)
      await deps.updateReadStatus(payload)
      json(response, 200, { ok: true })
      return
    }

    if (method === "POST" && url.pathname === "/api/feeds/refresh-all") {
      const result = await deps.refreshAllFeeds()
      json(response, 200, { data: result })
      return
    }

    if (
      method === "POST" &&
      url.pathname.startsWith("/api/feeds/") &&
      url.pathname.endsWith("/refresh")
    ) {
      const feedId = decodeURIComponent(
        url.pathname.replace("/api/feeds/", "").replace("/refresh", ""),
      )
      const result = await deps.refreshFeed(feedId)
      json(response, 200, { data: result })
      return
    }

    if (method === "GET" && url.pathname === "/api/subscriptions") {
      const subscriptions = await deps.getSubscriptions()
      json(response, 200, { data: subscriptions })
      return
    }

    json(response, 404, { error: "REMOTE_ROUTE_NOT_FOUND" })
  }

class RemoteServerManagerStatic {
  private server: ReturnType<typeof createServer> | null = null
  private sseClients = new Set<ServerResponse<IncomingMessage>>()
  private sseHeartbeats = new Map<ServerResponse<IncomingMessage>, ReturnType<typeof setInterval>>()
  private status: RemoteServerStatus = {
    running: false,
    host: null,
    port: null,
    baseUrl: null,
  }

  private deps: RemoteServerDependencies = {
    getSubscriptions: () => subscriptionApplicationService.listSubscriptions(),
    getEntries: async (feedId?: string) => {
      const { entryApplicationService } = await import("~/application/entry/service")
      return entryApplicationService.listEntries(feedId)
    },
    getUnreadCounts: async () => {
      const { unreadApplicationService } = await import("~/application/unread/service")
      return unreadApplicationService.listUnreadCounts()
    },
    updateReadStatus: async (payload) => {
      const { entryApplicationService } = await import("~/application/entry/service")
      await entryApplicationService.updateReadStatus(payload)
      this.broadcast("entries.updated", {})
      this.broadcast("subscriptions.updated", {})
    },
    refreshFeed: async (feedId) => {
      const { feedApplicationService } = await import("~/application/feed/service")
      const result = await feedApplicationService.refreshFeed(feedId)
      this.broadcast("entries.updated", { feedId })
      this.broadcast("subscriptions.updated", { feedId })
      return result
    },
    refreshAllFeeds: async () => {
      const { feedApplicationService } = await import("~/application/feed/service")
      const result = await feedApplicationService.refreshAllFeeds()
      this.broadcast("entries.updated", {})
      this.broadcast("subscriptions.updated", {})
      return result
    },
    getRemoteIndexHtml: () => getRemoteClientHtml(),
    getRemoteAsset: (pathname) => getRemoteClientAsset(pathname),
  }

  async start(options?: StartOptions): Promise<StartResult> {
    if (this.server) {
      return this.status as RunningServerStatus
    }

    const host = options?.host || REMOTE_SERVER_DEFAULT_HOST
    const port = options?.port ?? REMOTE_SERVER_DEFAULT_PORT
    this.deps = {
      ...this.deps,
      ...(options?.getSubscriptions ? { getSubscriptions: options.getSubscriptions } : {}),
      ...(options?.getEntries ? { getEntries: options.getEntries } : {}),
      ...(options?.getUnreadCounts ? { getUnreadCounts: options.getUnreadCounts } : {}),
      ...(options?.updateReadStatus ? { updateReadStatus: options.updateReadStatus } : {}),
      ...(options?.refreshFeed ? { refreshFeed: options.refreshFeed } : {}),
      ...(options?.refreshAllFeeds ? { refreshAllFeeds: options.refreshAllFeeds } : {}),
      ...(options?.getRemoteIndexHtml ? { getRemoteIndexHtml: options.getRemoteIndexHtml } : {}),
      ...(options?.getRemoteAsset ? { getRemoteAsset: options.getRemoteAsset } : {}),
    }

    this.server = createServer((request, response) => {
      void createRequestHandler(
        this.deps,
        () => this.getStatus(),
        (incomingRequest, sseResponse) => this.handleSseConnect(incomingRequest, sseResponse),
      )(request, response)
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject)
      this.server!.listen(port, host, () => {
        this.server!.off("error", reject)
        resolve()
      })
    })

    const address = this.server.address() as AddressInfo
    this.status = {
      running: true,
      host,
      port: address.port,
      baseUrl: getBaseUrl(host, address.port),
    }

    return this.status
  }

  async stop() {
    if (!this.server) return

    const currentServer = this.server
    this.server = null
    for (const client of this.sseClients) {
      this.cleanupSseClient(client)
      client.end()
    }

    await new Promise<void>((resolve, reject) => {
      currentServer.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })

    this.status = {
      running: false,
      host: null,
      port: null,
      baseUrl: null,
    }
  }

  getStatus(): RemoteServerStatus {
    return this.status
  }

  broadcast(event: RemoteEventName, payload: RemoteEventPayload = {}) {
    for (const client of this.sseClients) {
      writeSseEvent(client, event, payload)
    }
  }

  private handleSseConnect(request: IncomingMessage, response: ServerResponse<IncomingMessage>) {
    response.statusCode = 200
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8")
    response.setHeader("Cache-Control", "no-cache, no-transform")
    response.setHeader("Connection", "keep-alive")
    response.setHeader("X-Accel-Buffering", "no")
    this.sseClients.add(response)
    writeSseEvent(response, "ready", { connected: true })

    const heartbeat = setInterval(() => {
      writeSseEvent(response, "ping", {})
    }, 15000)
    this.sseHeartbeats.set(response, heartbeat)

    request.on("close", () => {
      this.cleanupSseClient(response)
      response.end()
    })
  }

  private cleanupSseClient(response: ServerResponse<IncomingMessage>) {
    const heartbeat = this.sseHeartbeats.get(response)
    if (heartbeat) {
      clearInterval(heartbeat)
      this.sseHeartbeats.delete(response)
    }

    this.sseClients.delete(response)
  }
}

export const RemoteServerManager = new RemoteServerManagerStatic()
