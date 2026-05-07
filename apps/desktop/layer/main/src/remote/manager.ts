import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

import { discoverApplicationService } from "~/application/discover/service"
import { feedApplicationService } from "~/application/feed/service"
import { importExportApplicationService } from "~/application/import-export/service"
import { pdfApplicationService } from "~/application/pdf/service"
import type { EntryPdfInput } from "~/application/pdf/service"
import { rsshubApplicationService } from "~/application/rsshub/service"
import { settingsApplicationService, type RemoteSettings } from "~/application/settings/service"
import { subscriptionApplicationService } from "~/application/subscription/service"

import { getRemoteClientAsset, getRemoteClientHtml } from "./client"
import { REMOTE_SERVER_DEFAULT_HOST, REMOTE_SERVER_DEFAULT_PORT } from "./config"
import { getRemoteShellHtml, getRemoteShellScript } from "./shell"

type SubscriptionRecord = Awaited<
  ReturnType<typeof subscriptionApplicationService.listSubscriptions>
>[number]

type EntryRecord = any

type RemoteServerDependencies = {
  getBootstrap: () => Promise<unknown>
  getCapabilities: () => Promise<unknown> | unknown
  getSettings: () => Promise<RemoteSettings> | RemoteSettings
  updateSettings: (payload: Partial<RemoteSettings>) => Promise<RemoteSettings> | RemoteSettings
  getSubscriptions: () => Promise<SubscriptionRecord[]>
  getEntries: (options?: { feedId?: string; unreadOnly?: boolean }) => Promise<EntryRecord[]>
  getEntry: (entryId: string) => Promise<EntryRecord | null>
  getUnreadCounts: () => Promise<Array<{ id: string; count: number }>>
  previewFeed: (payload: {
    url: string
    feedId?: string
    allowPublicRsshub?: boolean
  }) => Promise<unknown>
  createSubscription: (payload: {
    url: string
    view: number
    category?: string
    title?: string
  }) => Promise<unknown>
  deleteSubscription: (subscriptionId: string) => Promise<void>
  deleteSubscriptionsByTargets: (payload: {
    ids?: string[]
    feedIds?: string[]
    listIds?: string[]
    inboxIds?: string[]
  }) => Promise<void>
  updateSubscription: (
    subscriptionId: string,
    payload: { title?: string | null; category?: string | null; view?: number },
  ) => Promise<unknown>
  batchUpdateSubscriptions: (payload: {
    feedIds: string[]
    category?: string | null
    view?: number
  }) => Promise<void>
  updateReadStatus: (payload: { entryIds: string[]; read: boolean }) => Promise<void>
  refreshFeed: (feedId: string) => Promise<unknown>
  refreshAllFeeds: () => Promise<unknown>
  getRsshubConfig: () => Promise<unknown> | unknown
  setRsshubConfig: (payload: { customUrl?: string }) => Promise<unknown> | unknown
  precheckRsshub: (payload: { url: string; allowPublicFallback?: boolean }) => Promise<unknown>
  discover: (path: string, payload: Record<string, unknown>) => Promise<unknown>
  exportData: () => Promise<unknown>
  importData: (payload: unknown) => Promise<unknown>
  renderEntryPdf: (payload: EntryPdfInput) => Promise<Buffer>
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

const binary = (
  response: ServerResponse,
  statusCode: number,
  payload: Buffer,
  contentType: string,
  headers?: Record<string, string>,
) => {
  response.statusCode = statusCode
  response.setHeader("Content-Type", contentType)
  response.setHeader("Content-Length", payload.byteLength)
  for (const [key, value] of Object.entries(headers ?? {})) {
    response.setHeader(key, value)
  }
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

const toEntryPdfInput = (entry: EntryRecord): EntryPdfInput => {
  const contentHtml = entry.readabilityContent || entry.content || entry.description || ""
  const publishedAt = entry.publishedAt ? new Date(entry.publishedAt).toLocaleString() : undefined

  return {
    title: entry.title ?? undefined,
    contentHtml,
    author: entry.author ?? undefined,
    publishedAt,
    url: entry.url ?? undefined,
  }
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

    if (method === "GET" && url.pathname === "/api/bootstrap") {
      json(response, 200, { data: await deps.getBootstrap() })
      return
    }

    if (method === "GET" && url.pathname === "/api/capabilities") {
      json(response, 200, { data: await deps.getCapabilities() })
      return
    }

    if (method === "GET" && url.pathname === "/api/settings") {
      json(response, 200, { data: await deps.getSettings() })
      return
    }

    if (method === "PATCH" && url.pathname === "/api/settings") {
      const payload = await readJsonBody<Partial<RemoteSettings>>(request)
      json(response, 200, { data: await deps.updateSettings(payload) })
      return
    }

    if (method === "GET" && url.pathname === "/api/entries") {
      const feedId = url.searchParams.get("feedId") || undefined
      const unreadOnly = ["1", "true"].includes(
        (url.searchParams.get("unreadOnly") || "").toLowerCase(),
      )
      const entries = await deps.getEntries({ feedId, unreadOnly })
      json(response, 200, { data: entries })
      return
    }

    if (
      method === "GET" &&
      url.pathname.startsWith("/api/entries/") &&
      url.pathname.endsWith("/pdf")
    ) {
      const entryId = decodeURIComponent(
        url.pathname.replace("/api/entries/", "").replace("/pdf", ""),
      )
      const entry = await deps.getEntry(entryId)
      if (!entry) {
        json(response, 404, { error: "REMOTE_ENTRY_NOT_FOUND" })
        return
      }
      const pdfInput = toEntryPdfInput(entry)
      if (!pdfInput.contentHtml?.trim()) {
        json(response, 422, { error: "REMOTE_ENTRY_CONTENT_EMPTY" })
        return
      }
      const buffer = await deps.renderEntryPdf(pdfInput)
      binary(response, 200, buffer, "application/pdf", {
        "Content-Disposition": `inline; filename="${entryId}.pdf"`,
      })
      return
    }

    if (method === "GET" && url.pathname.startsWith("/api/entries/")) {
      const entryId = decodeURIComponent(url.pathname.replace("/api/entries/", ""))
      const entry = await deps.getEntry(entryId)
      json(response, 200, { data: entry })
      return
    }

    if (method === "POST" && url.pathname === "/api/feeds/preview") {
      const payload = await readJsonBody<{
        url: string
        feedId?: string
        allowPublicRsshub?: boolean
      }>(request)
      json(response, 200, { data: await deps.previewFeed(payload) })
      return
    }

    if (method === "GET" && url.pathname === "/api/unread") {
      const unreadCounts = await deps.getUnreadCounts()
      json(response, 200, { data: unreadCounts })
      return
    }

    if (method === "POST" && url.pathname === "/api/subscriptions") {
      const payload = await readJsonBody<{
        url: string
        view: number
        category?: string
        title?: string
      }>(request)
      const result = await deps.createSubscription(payload)
      json(response, 200, { data: result })
      return
    }

    if (method === "PATCH" && url.pathname === "/api/subscriptions") {
      const payload = await readJsonBody<{
        feedIds: string[]
        category?: string | null
        view?: number
      }>(request)
      await deps.batchUpdateSubscriptions(payload)
      json(response, 200, { ok: true })
      return
    }

    if (method === "DELETE" && url.pathname === "/api/subscriptions") {
      const payload = await readJsonBody<{
        ids?: string[]
        feedIds?: string[]
        listIds?: string[]
        inboxIds?: string[]
      }>(request)
      await deps.deleteSubscriptionsByTargets(payload)
      json(response, 200, { ok: true })
      return
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/subscriptions/")) {
      const subscriptionId = decodeURIComponent(url.pathname.replace("/api/subscriptions/", ""))
      await deps.deleteSubscription(subscriptionId)
      json(response, 200, { ok: true })
      return
    }

    if (method === "PATCH" && url.pathname.startsWith("/api/subscriptions/")) {
      const subscriptionId = decodeURIComponent(url.pathname.replace("/api/subscriptions/", ""))
      const payload = await readJsonBody<{
        title?: string | null
        category?: string | null
        view?: number
      }>(request)
      const result = await deps.updateSubscription(subscriptionId, payload)
      json(response, 200, { data: result })
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

    if (method === "GET" && url.pathname === "/api/rsshub/config") {
      json(response, 200, { data: await deps.getRsshubConfig() })
      return
    }

    if (method === "PUT" && url.pathname === "/api/rsshub/config") {
      const payload = await readJsonBody<{ customUrl?: string }>(request)
      json(response, 200, { data: await deps.setRsshubConfig(payload) })
      return
    }

    if (method === "POST" && url.pathname === "/api/rsshub/precheck") {
      const payload = await readJsonBody<{ url: string; allowPublicFallback?: boolean }>(request)
      json(response, 200, { data: await deps.precheckRsshub(payload) })
      return
    }

    if (method === "GET" && url.pathname.startsWith("/api/discover/")) {
      const discoverPath = `/${url.pathname.replace("/api/discover/", "")}`
      const payload = Object.fromEntries(url.searchParams.entries())
      json(response, 200, { data: await deps.discover(discoverPath, payload) })
      return
    }

    if (method === "GET" && url.pathname === "/api/export") {
      json(response, 200, { data: await deps.exportData() })
      return
    }

    if (method === "POST" && url.pathname === "/api/import") {
      const payload = await readJsonBody<unknown>(request)
      json(response, 200, { data: await deps.importData(payload) })
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
    getCapabilities: () => settingsApplicationService.getCapabilities(),
    getSettings: () => settingsApplicationService.getSettings(),
    updateSettings: (payload) => settingsApplicationService.updateSettings(payload),
    getBootstrap: async () => {
      const { unreadApplicationService } = await import("~/application/unread/service")
      const [subscriptions, unread, settings] = await Promise.all([
        subscriptionApplicationService.listSubscriptions(),
        unreadApplicationService.listUnreadCounts(),
        Promise.resolve(settingsApplicationService.getSettings()),
      ])
      return {
        subscriptions,
        unread,
        settings,
        capabilities: settingsApplicationService.getCapabilities(),
      }
    },
    getSubscriptions: () => subscriptionApplicationService.listSubscriptions(),
    getEntries: async (options?: { feedId?: string; unreadOnly?: boolean }) => {
      const { entryApplicationService } = await import("~/application/entry/service")
      return entryApplicationService.listEntries(options)
    },
    getEntry: async (entryId: string) => {
      const { entryApplicationService } = await import("~/application/entry/service")
      return entryApplicationService.getEntry(entryId)
    },
    getUnreadCounts: async () => {
      const { unreadApplicationService } = await import("~/application/unread/service")
      return unreadApplicationService.listUnreadCounts()
    },
    createSubscription: async (payload) => {
      const result = await subscriptionApplicationService.createSubscription(payload)
      this.broadcast("subscriptions.updated", {})
      this.broadcast("entries.updated", {})
      return result
    },
    deleteSubscription: async (subscriptionId) => {
      await subscriptionApplicationService.deleteSubscription(subscriptionId)
      this.broadcast("subscriptions.updated", {})
      this.broadcast("entries.updated", {})
    },
    deleteSubscriptionsByTargets: async (payload) => {
      await subscriptionApplicationService.deleteSubscriptionsByTargets(payload)
      this.broadcast("subscriptions.updated", {})
      this.broadcast("entries.updated", {})
    },
    updateSubscription: async (subscriptionId, payload) => {
      const result = await subscriptionApplicationService.updateSubscription(
        subscriptionId,
        payload,
      )
      this.broadcast("subscriptions.updated", {})
      this.broadcast("entries.updated", {})
      return result
    },
    batchUpdateSubscriptions: async (payload) => {
      await subscriptionApplicationService.batchUpdateSubscriptions(payload)
      this.broadcast("subscriptions.updated", {})
      this.broadcast("entries.updated", {})
    },
    previewFeed: (payload) => feedApplicationService.previewFeed(payload),
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
    getRsshubConfig: () => rsshubApplicationService.getConfig(),
    setRsshubConfig: (payload) => rsshubApplicationService.setConfig(payload),
    precheckRsshub: (payload) => Promise.resolve(rsshubApplicationService.precheck(payload)),
    discover: (path, payload) => discoverApplicationService.request(path, payload),
    exportData: () => importExportApplicationService.exportData(),
    importData: async (payload) => {
      const result = await importExportApplicationService.importData(payload)
      this.broadcast("subscriptions.updated", {})
      this.broadcast("entries.updated", {})
      return result
    },
    renderEntryPdf: (payload) => pdfApplicationService.renderEntryPdf(payload),
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
      ...(options?.getBootstrap ? { getBootstrap: options.getBootstrap } : {}),
      ...(options?.getCapabilities ? { getCapabilities: options.getCapabilities } : {}),
      ...(options?.getSettings ? { getSettings: options.getSettings } : {}),
      ...(options?.updateSettings ? { updateSettings: options.updateSettings } : {}),
      ...(options?.getSubscriptions ? { getSubscriptions: options.getSubscriptions } : {}),
      ...(options?.getEntries ? { getEntries: options.getEntries } : {}),
      ...(options?.getEntry ? { getEntry: options.getEntry } : {}),
      ...(options?.getUnreadCounts ? { getUnreadCounts: options.getUnreadCounts } : {}),
      ...(options?.previewFeed ? { previewFeed: options.previewFeed } : {}),
      ...(options?.createSubscription ? { createSubscription: options.createSubscription } : {}),
      ...(options?.deleteSubscription ? { deleteSubscription: options.deleteSubscription } : {}),
      ...(options?.deleteSubscriptionsByTargets
        ? { deleteSubscriptionsByTargets: options.deleteSubscriptionsByTargets }
        : {}),
      ...(options?.updateSubscription ? { updateSubscription: options.updateSubscription } : {}),
      ...(options?.batchUpdateSubscriptions
        ? { batchUpdateSubscriptions: options.batchUpdateSubscriptions }
        : {}),
      ...(options?.updateReadStatus ? { updateReadStatus: options.updateReadStatus } : {}),
      ...(options?.refreshFeed ? { refreshFeed: options.refreshFeed } : {}),
      ...(options?.refreshAllFeeds ? { refreshAllFeeds: options.refreshAllFeeds } : {}),
      ...(options?.getRsshubConfig ? { getRsshubConfig: options.getRsshubConfig } : {}),
      ...(options?.setRsshubConfig ? { setRsshubConfig: options.setRsshubConfig } : {}),
      ...(options?.precheckRsshub ? { precheckRsshub: options.precheckRsshub } : {}),
      ...(options?.discover ? { discover: options.discover } : {}),
      ...(options?.exportData ? { exportData: options.exportData } : {}),
      ...(options?.importData ? { importData: options.importData } : {}),
      ...(options?.renderEntryPdf ? { renderEntryPdf: options.renderEntryPdf } : {}),
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
