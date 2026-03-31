import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

import { subscriptionApplicationService } from "~/application/subscription/service"

import { REMOTE_SERVER_DEFAULT_HOST, REMOTE_SERVER_DEFAULT_PORT } from "./config"
import { getRemoteShellHtml, getRemoteShellScript } from "./shell"

type SubscriptionRecord = Awaited<
  ReturnType<typeof subscriptionApplicationService.listSubscriptions>
>[number]

type EntryRecord = any

type RemoteServerDependencies = {
  getSubscriptions: () => Promise<SubscriptionRecord[]>
  getEntries: (feedId?: string) => Promise<EntryRecord[]>
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

const json = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.statusCode = statusCode
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.end(JSON.stringify(payload))
}

const text = (
  response: ServerResponse,
  statusCode: number,
  payload: string,
  contentType: string,
) => {
  response.statusCode = statusCode
  response.setHeader("Content-Type", contentType)
  response.end(payload)
}

const getBaseUrl = (host: string, port: number) => `http://${host}:${port}`

const createRequestHandler =
  (deps: RemoteServerDependencies, getStatus: () => RemoteServerStatus) =>
  async (request: IncomingMessage, response: ServerResponse) => {
    const method = request.method || "GET"
    const url = new URL(request.url || "/", "http://127.0.0.1")

    if (method === "GET" && url.pathname === "/health") {
      json(response, 200, { ok: true })
      return
    }

    if (method === "GET" && url.pathname === "/") {
      text(response, 200, getRemoteShellHtml(), "text/html; charset=utf-8")
      return
    }

    if (method === "GET" && url.pathname === "/remote.js") {
      text(response, 200, getRemoteShellScript(), "text/javascript; charset=utf-8")
      return
    }

    if (method === "GET" && url.pathname === "/events") {
      response.statusCode = 200
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8")
      response.setHeader("Cache-Control", "no-cache, no-transform")
      response.setHeader("Connection", "keep-alive")
      response.setHeader("X-Accel-Buffering", "no")
      response.write('event: ready\ndata: {"connected":true}\n\n')

      const heartbeat = setInterval(() => {
        response.write("event: ping\ndata: {}\n\n")
      }, 15000)

      request.on("close", () => {
        clearInterval(heartbeat)
        response.end()
      })
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

    if (method === "GET" && url.pathname === "/api/subscriptions") {
      const subscriptions = await deps.getSubscriptions()
      json(response, 200, { data: subscriptions })
      return
    }

    json(response, 404, { error: "REMOTE_ROUTE_NOT_FOUND" })
  }

class RemoteServerManagerStatic {
  private server: ReturnType<typeof createServer> | null = null
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
    }

    this.server = createServer((request, response) => {
      void createRequestHandler(this.deps, () => this.getStatus())(request, response)
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
}

export const RemoteServerManager = new RemoteServerManagerStatic()
