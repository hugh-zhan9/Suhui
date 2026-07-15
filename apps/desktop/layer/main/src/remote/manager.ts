import { randomUUID } from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

import {
  createEntryChangeEventV1,
  type EntryChangeEventV1,
  type EntryChangeReason,
  type EntryChangeScope,
} from "@suhui/shared/entry-change"

import { agentApplicationService } from "~/application/agent/service"
import { AgentApplicationError, agentReadStatusMaxEntryIds } from "~/application/agent/types"
import { entryQueryService } from "~/application/entry/query-service"
import {
  type EntryListQuery,
  EntryQueryError,
  type EntrySummaryPage,
  normalizeEntryListLimit,
} from "~/application/entry/query-types"
import type {
  AgentEntriesListOptions,
  AgentEntriesListResult,
  AgentEntryDetail,
  AgentFeedsListResult,
  AgentReadStatusResult,
} from "~/application/agent/types"
import { collectionApplicationService } from "~/application/collection/service"
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
type CollectionRecord = Awaited<
  ReturnType<typeof collectionApplicationService.listCollections>
>[number]
type BootstrapFeed = {
  id: string
  title: string | null
  url: string
}
type RemoteBootstrapPayload = {
  subscriptions: SubscriptionRecord[]
  feeds: BootstrapFeed[]
  unread: Array<{ id: string; count: number }>
  collections: CollectionRecord[]
  settings: RemoteSettings
  capabilities: unknown
}

type EntryRecord = any

type RemoteServerDependencies = {
  getBootstrap: () => Promise<RemoteBootstrapPayload>
  getCapabilities: () => Promise<unknown> | unknown
  getSettings: () => Promise<RemoteSettings> | RemoteSettings
  updateSettings: (payload: Partial<RemoteSettings>) => Promise<RemoteSettings> | RemoteSettings
  getSubscriptions: () => Promise<SubscriptionRecord[]>
  listEntries: (query: EntryListQuery) => Promise<EntrySummaryPage>
  getEntry: (entryId: string) => Promise<EntryRecord | null>
  getAgentEntries: (options?: AgentEntriesListOptions) => Promise<AgentEntriesListResult>
  getAgentEntry: (entryId: string) => Promise<AgentEntryDetail | null>
  getAgentFeeds: () => Promise<AgentFeedsListResult>
  updateAgentReadStatus: (payload: {
    entryIds: string[]
    read: boolean
  }) => Promise<AgentReadStatusResult>
  getCollections: () => Promise<unknown[]>
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
  updateEntryStar: (payload: { entryId: string; starred: boolean; view: number }) => Promise<void>
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
type RemoteMutationEventName = Extract<RemoteEventName, "entries.updated" | "subscriptions.updated">

type RemoteMutationChange = {
  reason: EntryChangeReason
  scope: EntryChangeScope
  feedIds: string[]
  entryIds?: string[]
  refreshed?: number
  failed?: number
  feedId?: string
}

const extractBootstrapFeeds = (subscriptions: SubscriptionRecord[]): BootstrapFeed[] => {
  const feeds = new Map<string, BootstrapFeed>()
  for (const subscription of subscriptions) {
    if (subscription.type !== "feed" || !subscription.feedId || feeds.has(subscription.feedId)) {
      continue
    }
    feeds.set(subscription.feedId, {
      id: subscription.feedId,
      title: subscription.title ?? null,
      url: "",
    })
  }
  return Array.from(feeds.values())
}

const completeRemoteMutation = async <T>({
  operation,
  buildChange,
  event,
  broadcast,
}: {
  operation: () => Promise<T>
  buildChange: (result: T) => RemoteMutationChange
  event: RemoteMutationEventName
  broadcast: (event: RemoteMutationEventName, changeSet: EntryChangeEventV1) => void
}) => {
  const batchId = randomUUID()
  const result = await operation()
  const changeSet = createEntryChangeEventV1({
    batchId,
    source: "remote",
    completedAt: Date.now(),
    ...buildChange(result),
  })
  if (changeSet.reason !== "refresh" || changeSet.feedIds.length > 0) {
    broadcast(event, changeSet)
  }
  return { result, batchId, changeSet }
}

const getRefreshAllChange = (input: unknown): RemoteMutationChange => {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const rawResults = Array.isArray(value.results) ? value.results : []
  const feedIds: string[] = []
  const seen = new Set<string>()
  for (const rawResult of rawResults) {
    if (!rawResult || typeof rawResult !== "object") continue
    const result = rawResult as Record<string, unknown>
    if (result.ok !== true || typeof result.feedId !== "string") continue
    const feedId = result.feedId.trim()
    if (!feedId || seen.has(feedId)) continue
    seen.add(feedId)
    feedIds.push(feedId)
  }

  const successCount = Number.isInteger(value.successCount)
    ? (value.successCount as number)
    : feedIds.length
  const failCount = Number.isInteger(value.failCount) ? (value.failCount as number) : 0
  return {
    reason: "refresh",
    scope: "feeds",
    feedIds,
    refreshed: Math.max(successCount, 0),
    failed: Math.max(failCount, 0),
  }
}

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
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new AgentApplicationError("SUHUI_INVALID_JSON", "request body must be valid JSON", 400)
  }
}

const parseOptionalBoolean = (name: string, value: string | null) => {
  if (value === null) return undefined
  const normalized = value.toLowerCase()
  if (normalized === "true" || normalized === "1") return true
  if (normalized === "false" || normalized === "0") return false
  throw new AgentApplicationError(
    "SUHUI_INVALID_READ_FILTER",
    `${name} must be true, false, 1, or 0`,
    400,
  )
}

const parseEntryBoolean = (
  name: string,
  value: string | null,
  code: "SUHUI_INVALID_ENTRY_SCOPE" | "SUHUI_INVALID_READ_FILTER",
) => {
  if (value === null) return undefined
  const normalized = value.toLowerCase()
  if (normalized === "true" || normalized === "1") return true
  if (normalized === "false" || normalized === "0") return false
  throw new EntryQueryError(code, `${name} must be true, false, 1, or 0`)
}

const parseEntryView = (value: string | null) => {
  if (value === null) return undefined
  const view = Number(value)
  if (!Number.isInteger(view)) {
    throw new EntryQueryError("SUHUI_INVALID_ENTRY_SCOPE", "view must be an integer")
  }
  return view
}

export const parseRemoteEntryListQuery = (searchParams: URLSearchParams): EntryListQuery => {
  const hasFeeds = searchParams.has("feedId")
  const hasList = searchParams.has("listId")
  const hasInbox = searchParams.has("inboxId")
  const isCollection = parseEntryBoolean(
    "isCollection",
    searchParams.get("isCollection"),
    "SUHUI_INVALID_ENTRY_SCOPE",
  )
  const explicitScopeCount = [hasFeeds, hasList, hasInbox, isCollection === true].filter(
    Boolean,
  ).length
  if (explicitScopeCount > 1) {
    throw new EntryQueryError(
      "SUHUI_INVALID_ENTRY_SCOPE",
      "feedId, listId, inboxId, and isCollection are mutually exclusive",
    )
  }

  const excludePrivate = parseEntryBoolean(
    "excludePrivate",
    searchParams.get("excludePrivate"),
    "SUHUI_INVALID_ENTRY_SCOPE",
  )
  if (explicitScopeCount > 0 && searchParams.has("excludePrivate")) {
    throw new EntryQueryError(
      "SUHUI_INVALID_ENTRY_SCOPE",
      "excludePrivate is only valid for timeline queries",
    )
  }

  const view = parseEntryView(searchParams.get("view"))
  const scope: EntryListQuery["scope"] = hasFeeds
    ? { kind: "feeds", feedIds: searchParams.getAll("feedId") }
    : hasList
      ? { kind: "list", listId: searchParams.get("listId") ?? "" }
      : hasInbox
        ? { kind: "inbox", inboxId: searchParams.get("inboxId") ?? "" }
        : isCollection === true
          ? { kind: "collection", ...(view === undefined ? {} : { view }) }
          : {
              kind: "timeline",
              ...(view === undefined ? {} : { view }),
              ...(excludePrivate === undefined ? {} : { excludePrivate }),
            }

  const read = parseEntryBoolean("read", searchParams.get("read"), "SUHUI_INVALID_READ_FILTER")
  const unreadOnly = parseEntryBoolean(
    "unreadOnly",
    searchParams.get("unreadOnly"),
    "SUHUI_INVALID_READ_FILTER",
  )
  if (unreadOnly === true && read === true) {
    throw new EntryQueryError(
      "SUHUI_INVALID_READ_FILTER",
      "unreadOnly=true conflicts with read=true",
    )
  }

  const limitValue = searchParams.get("limit")
  const limit = limitValue === null ? undefined : normalizeEntryListLimit(Number(limitValue))
  const cursorValue = searchParams.get("cursor")
  if (cursorValue !== null && !cursorValue) {
    throw new EntryQueryError("SUHUI_INVALID_CURSOR", "cursor must be a non-empty string")
  }

  return {
    scope,
    ...(unreadOnly === true ? { read: false } : read === undefined ? {} : { read }),
    ...(limit === undefined ? {} : { limit }),
    ...(cursorValue === null ? {} : { cursor: cursorValue }),
  }
}

const parseAgentEntriesOptions = (url: URL): AgentEntriesListOptions => {
  const feedId = url.searchParams.get("feedId") || undefined
  const read = parseOptionalBoolean("read", url.searchParams.get("read"))
  const limitValue = url.searchParams.get("limit")
  const cursor = url.searchParams.get("cursor") || undefined
  const withSummary = ["1", "true"].includes(
    (url.searchParams.get("withSummary") || "").toLowerCase(),
  )

  return {
    ...(feedId ? { feedId } : {}),
    ...(typeof read === "boolean" ? { read } : {}),
    ...(limitValue ? { limit: Number(limitValue) } : {}),
    ...(cursor ? { cursor } : {}),
    ...(withSummary ? { withSummary } : {}),
  }
}

const validateAgentReadStatusPayload = (
  payload: unknown,
): { entryIds: string[]; read: boolean } => {
  const value = payload as { entryIds?: unknown; read?: unknown } | null

  if (typeof value?.read !== "boolean") {
    throw new AgentApplicationError("SUHUI_INVALID_READ_STATUS", "read must be true or false", 400)
  }

  if (
    !Array.isArray(value.entryIds) ||
    value.entryIds.length === 0 ||
    value.entryIds.some((entryId) => typeof entryId !== "string")
  ) {
    throw new AgentApplicationError(
      "SUHUI_INVALID_ENTRY_IDS",
      "entryIds must be a non-empty string array",
      400,
    )
  }

  if (value.entryIds.length > agentReadStatusMaxEntryIds) {
    throw new AgentApplicationError(
      "SUHUI_INVALID_ENTRY_IDS",
      `entryIds must include at most ${agentReadStatusMaxEntryIds} ids`,
      400,
    )
  }

  return {
    entryIds: value.entryIds,
    read: value.read,
  }
}

const writeAgentError = (response: ServerResponse, error: unknown) => {
  if (error instanceof AgentApplicationError) {
    json(response, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
      },
    })
    return
  }

  console.error("[RemoteServerManager] agent api failed", error)
  json(response, 500, {
    error: {
      code: "SUHUI_AGENT_INTERNAL_ERROR",
      message: "Agent API failed",
    },
  })
}

const writeEntryQueryError = (response: ServerResponse, error: unknown) => {
  if (error instanceof EntryQueryError) {
    json(response, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
      },
    })
    return
  }

  console.error("[RemoteServerManager] entry query failed")
  json(response, 500, {
    error: {
      code: "SUHUI_ENTRY_QUERY_INTERNAL_ERROR",
      message: "Entry query failed",
    },
  })
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
    broadcast: (event: RemoteMutationEventName, changeSet: EntryChangeEventV1) => void,
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
      try {
        json(response, 200, { data: await deps.getBootstrap() })
      } catch {
        console.error("[RemoteServerManager] bootstrap failed")
        json(response, 500, { error: "REMOTE_BOOTSTRAP_FAILED" })
      }
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

    if (method === "GET" && url.pathname === "/api/agent/entries") {
      try {
        const result = await deps.getAgentEntries(parseAgentEntriesOptions(url))
        json(response, 200, { data: result })
      } catch (error) {
        writeAgentError(response, error)
      }
      return
    }

    if (method === "GET" && url.pathname === "/api/agent/feeds") {
      try {
        const result = await deps.getAgentFeeds()
        json(response, 200, { data: result })
      } catch (error) {
        writeAgentError(response, error)
      }
      return
    }

    if (method === "GET" && url.pathname.startsWith("/api/agent/entries/")) {
      try {
        const entryId = decodeURIComponent(url.pathname.replace("/api/agent/entries/", ""))
        const entry = await deps.getAgentEntry(entryId)
        if (!entry) {
          json(response, 404, {
            error: {
              code: "SUHUI_ENTRY_NOT_FOUND",
              message: "Entry not found",
            },
          })
          return
        }
        json(response, 200, { data: entry })
      } catch (error) {
        writeAgentError(response, error)
      }
      return
    }

    if (method === "POST" && url.pathname === "/api/agent/entries/read") {
      try {
        const payload = validateAgentReadStatusPayload(await readJsonBody<unknown>(request))
        const mutation = await completeRemoteMutation({
          operation: () => deps.updateAgentReadStatus(payload),
          buildChange: () => ({
            reason: "read",
            scope: "all",
            feedIds: [],
            entryIds: payload.entryIds,
          }),
          event: "entries.updated",
          broadcast,
        })
        json(response, 200, {
          data: mutation.result,
          batchId: mutation.batchId,
          changeSet: mutation.changeSet,
        })
      } catch (error) {
        writeAgentError(response, error)
      }
      return
    }

    if (method === "GET" && url.pathname === "/api/entries") {
      try {
        const result = await deps.listEntries(parseRemoteEntryListQuery(url.searchParams))
        json(response, 200, { data: result.items, page: result.page })
      } catch (error) {
        writeEntryQueryError(response, error)
      }
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

    if (method === "GET" && url.pathname === "/api/collections") {
      json(response, 200, { data: await deps.getCollections() })
      return
    }

    if (method === "POST" && url.pathname === "/api/subscriptions") {
      const payload = await readJsonBody<{
        url: string
        view: number
        category?: string
        title?: string
      }>(request)
      const mutation = await completeRemoteMutation({
        operation: () => deps.createSubscription(payload),
        buildChange: () => ({
          reason: "subscription",
          scope: "all",
          feedIds: [],
        }),
        event: "subscriptions.updated",
        broadcast,
      })
      json(response, 200, {
        data: mutation.result,
        batchId: mutation.batchId,
        changeSet: mutation.changeSet,
      })
      return
    }

    if (method === "PATCH" && url.pathname === "/api/subscriptions") {
      const payload = await readJsonBody<{
        feedIds: string[]
        category?: string | null
        view?: number
      }>(request)
      const mutation = await completeRemoteMutation({
        operation: () => deps.batchUpdateSubscriptions(payload),
        buildChange: () => ({
          reason: "subscription",
          scope: "all",
          feedIds: payload.feedIds,
        }),
        event: "subscriptions.updated",
        broadcast,
      })
      json(response, 200, { ok: true, batchId: mutation.batchId, changeSet: mutation.changeSet })
      return
    }

    if (method === "DELETE" && url.pathname === "/api/subscriptions") {
      const payload = await readJsonBody<{
        ids?: string[]
        feedIds?: string[]
        listIds?: string[]
        inboxIds?: string[]
      }>(request)
      const mutation = await completeRemoteMutation({
        operation: () => deps.deleteSubscriptionsByTargets(payload),
        buildChange: () => ({
          reason: "subscription",
          scope: "all",
          feedIds: payload.feedIds ?? [],
        }),
        event: "subscriptions.updated",
        broadcast,
      })
      json(response, 200, { ok: true, batchId: mutation.batchId, changeSet: mutation.changeSet })
      return
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/subscriptions/")) {
      const subscriptionId = decodeURIComponent(url.pathname.replace("/api/subscriptions/", ""))
      const mutation = await completeRemoteMutation({
        operation: () => deps.deleteSubscription(subscriptionId),
        buildChange: () => ({ reason: "subscription", scope: "all", feedIds: [] }),
        event: "subscriptions.updated",
        broadcast,
      })
      json(response, 200, { ok: true, batchId: mutation.batchId, changeSet: mutation.changeSet })
      return
    }

    if (method === "PATCH" && url.pathname.startsWith("/api/subscriptions/")) {
      const subscriptionId = decodeURIComponent(url.pathname.replace("/api/subscriptions/", ""))
      const payload = await readJsonBody<{
        title?: string | null
        category?: string | null
        view?: number
      }>(request)
      const mutation = await completeRemoteMutation({
        operation: () => deps.updateSubscription(subscriptionId, payload),
        buildChange: () => ({ reason: "subscription", scope: "all", feedIds: [] }),
        event: "subscriptions.updated",
        broadcast,
      })
      json(response, 200, {
        data: mutation.result,
        batchId: mutation.batchId,
        changeSet: mutation.changeSet,
      })
      return
    }

    if (method === "POST" && url.pathname === "/api/entries/read") {
      const payload = await readJsonBody<{ entryIds: string[]; read: boolean }>(request)
      const mutation = await completeRemoteMutation({
        operation: () => deps.updateReadStatus(payload),
        buildChange: () => ({
          reason: "read",
          scope: "all",
          feedIds: [],
          entryIds: payload.entryIds,
        }),
        event: "entries.updated",
        broadcast,
      })
      json(response, 200, { ok: true, batchId: mutation.batchId, changeSet: mutation.changeSet })
      return
    }

    if (method === "POST" && url.pathname === "/api/entries/star") {
      const payload = await readJsonBody<{
        entryId: string
        starred: boolean
        view: number
      }>(request)
      const mutation = await completeRemoteMutation({
        operation: () => deps.updateEntryStar(payload),
        buildChange: () => ({
          reason: "collection",
          scope: "all",
          feedIds: [],
          entryIds: [payload.entryId],
        }),
        event: "entries.updated",
        broadcast,
      })
      json(response, 200, { ok: true, batchId: mutation.batchId, changeSet: mutation.changeSet })
      return
    }

    if (method === "POST" && url.pathname === "/api/feeds/refresh-all") {
      const mutation = await completeRemoteMutation({
        operation: () => deps.refreshAllFeeds(),
        buildChange: getRefreshAllChange,
        event: "entries.updated",
        broadcast,
      })
      json(response, 200, {
        data: mutation.result,
        batchId: mutation.batchId,
        changeSet: mutation.changeSet,
      })
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
      const mutation = await completeRemoteMutation({
        operation: () => deps.refreshFeed(feedId),
        buildChange: () => ({
          reason: "refresh",
          scope: "feeds",
          feedIds: [feedId],
          feedId,
          refreshed: 1,
          failed: 0,
        }),
        event: "entries.updated",
        broadcast,
      })
      json(response, 200, {
        data: mutation.result,
        batchId: mutation.batchId,
        changeSet: mutation.changeSet,
      })
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
      const mutation = await completeRemoteMutation({
        operation: () => deps.importData(payload),
        buildChange: () => ({ reason: "import", scope: "all", feedIds: [] }),
        event: "entries.updated",
        broadcast,
      })
      json(response, 200, {
        data: mutation.result,
        batchId: mutation.batchId,
        changeSet: mutation.changeSet,
      })
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

  private createDefaultDependencies(): RemoteServerDependencies {
    return {
      getCapabilities: () => settingsApplicationService.getCapabilities(),
      getSettings: () => settingsApplicationService.getSettings(),
      updateSettings: (payload) => settingsApplicationService.updateSettings(payload),
      getBootstrap: async () => {
        const { unreadApplicationService } = await import("~/application/unread/service")
        const [subscriptions, unread, collections, settings, capabilities] = await Promise.all([
          subscriptionApplicationService.listSubscriptions(),
          unreadApplicationService.listUnreadCounts(),
          collectionApplicationService.listCollections(),
          Promise.resolve(settingsApplicationService.getSettings()),
          Promise.resolve(settingsApplicationService.getCapabilities()),
        ])
        return {
          subscriptions,
          feeds: extractBootstrapFeeds(subscriptions),
          unread,
          collections,
          settings,
          capabilities,
        }
      },
      getSubscriptions: () => subscriptionApplicationService.listSubscriptions(),
      listEntries: (query) => entryQueryService.list(query),
      getEntry: (entryId) => entryQueryService.getDetail(entryId, "active-relations"),
      getAgentEntries: (options) => agentApplicationService.listEntries(options),
      getAgentEntry: (entryId) => agentApplicationService.getEntry(entryId),
      getAgentFeeds: () => agentApplicationService.listFeeds(),
      updateAgentReadStatus: async (payload) => {
        return agentApplicationService.updateReadStatus(payload)
      },
      getCollections: () => collectionApplicationService.listCollections(),
      getUnreadCounts: async () => {
        const { unreadApplicationService } = await import("~/application/unread/service")
        return unreadApplicationService.listUnreadCounts()
      },
      createSubscription: async (payload) => {
        return subscriptionApplicationService.createSubscription(payload)
      },
      deleteSubscription: async (subscriptionId) => {
        await subscriptionApplicationService.deleteSubscription(subscriptionId)
      },
      deleteSubscriptionsByTargets: async (payload) => {
        await subscriptionApplicationService.deleteSubscriptionsByTargets(payload)
      },
      updateSubscription: async (subscriptionId, payload) => {
        return subscriptionApplicationService.updateSubscription(subscriptionId, payload)
      },
      batchUpdateSubscriptions: async (payload) => {
        await subscriptionApplicationService.batchUpdateSubscriptions(payload)
      },
      previewFeed: (payload) => feedApplicationService.previewFeed(payload),
      updateReadStatus: async (payload) => {
        const { entryApplicationService } = await import("~/application/entry/service")
        await entryApplicationService.updateReadStatus(payload)
      },
      updateEntryStar: async (payload) => {
        await collectionApplicationService.updateEntryStar(payload)
      },
      refreshFeed: async (feedId) => {
        const { feedApplicationService } = await import("~/application/feed/service")
        return feedApplicationService.refreshFeed(feedId)
      },
      refreshAllFeeds: async () => {
        const { feedApplicationService } = await import("~/application/feed/service")
        return feedApplicationService.refreshAllFeeds()
      },
      getRsshubConfig: () => rsshubApplicationService.getConfig(),
      setRsshubConfig: (payload) => rsshubApplicationService.setConfig(payload),
      precheckRsshub: (payload) => Promise.resolve(rsshubApplicationService.precheck(payload)),
      discover: (path, payload) => discoverApplicationService.request(path, payload),
      exportData: () => importExportApplicationService.exportData(),
      importData: async (payload) => {
        return importExportApplicationService.importData(payload)
      },
      renderEntryPdf: (payload) => pdfApplicationService.renderEntryPdf(payload),
      getRemoteIndexHtml: () => getRemoteClientHtml(),
      getRemoteAsset: (pathname) => getRemoteClientAsset(pathname),
    }
  }

  private deps: RemoteServerDependencies = this.createDefaultDependencies()

  async start(options?: StartOptions): Promise<StartResult> {
    if (this.server) {
      return this.status as RunningServerStatus
    }

    const host = options?.host || REMOTE_SERVER_DEFAULT_HOST
    const port = options?.port ?? REMOTE_SERVER_DEFAULT_PORT
    this.deps = {
      ...this.createDefaultDependencies(),
      ...(options?.getBootstrap ? { getBootstrap: options.getBootstrap } : {}),
      ...(options?.getCapabilities ? { getCapabilities: options.getCapabilities } : {}),
      ...(options?.getSettings ? { getSettings: options.getSettings } : {}),
      ...(options?.updateSettings ? { updateSettings: options.updateSettings } : {}),
      ...(options?.getSubscriptions ? { getSubscriptions: options.getSubscriptions } : {}),
      ...(options?.listEntries ? { listEntries: options.listEntries } : {}),
      ...(options?.getEntry ? { getEntry: options.getEntry } : {}),
      ...(options?.getAgentEntries ? { getAgentEntries: options.getAgentEntries } : {}),
      ...(options?.getAgentEntry ? { getAgentEntry: options.getAgentEntry } : {}),
      ...(options?.getAgentFeeds ? { getAgentFeeds: options.getAgentFeeds } : {}),
      ...(options?.updateAgentReadStatus
        ? { updateAgentReadStatus: options.updateAgentReadStatus }
        : {}),
      ...(options?.getCollections ? { getCollections: options.getCollections } : {}),
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
      ...(options?.updateEntryStar ? { updateEntryStar: options.updateEntryStar } : {}),
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
        (event, changeSet) => this.broadcast(event, changeSet),
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
    if (!this.server) {
      this.deps = this.createDefaultDependencies()
      return
    }

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
    this.deps = this.createDefaultDependencies()
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
