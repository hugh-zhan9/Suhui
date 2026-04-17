import { feedActions, useFeedStore } from "@suhui/store/feed/store"
import { getHydratePhaseState, runWithHydrateSource } from "@suhui/store/hydrate-phases"
import { useEntryStore, type EntryState } from "@suhui/store/entry/base"
import { entryActions } from "@suhui/store/entry/store"
import { subscriptionActions, useSubscriptionStore } from "@suhui/store/subscription/store"
import { unreadActions, useUnreadStore } from "@suhui/store/unread/store"
import { LOCAL_USER_ID, useUserStore } from "@suhui/store/user/store"
import { getStorageNS } from "@suhui/utils/ns"

import { getRendererDbConfig } from "~/lib/client"
import { appLog } from "~/lib/log"
import { registerRendererPersistResetHook } from "~/lib/query-client"
import { getRouteParams } from "~/hooks/biz/useRouteParams"
import { ElectronCloseEvent } from "~/providers/invalidate-query-provider"

import {
  recordSnapshotRestoreResult,
  recordStartupMetric,
  type StartupSnapshotRestoreResult,
} from "./startup-metrics"

export const STARTUP_SNAPSHOT_NAMESPACE = "renderer-startup-snapshot"
export const STARTUP_SNAPSHOT_VERSION = 1
export const STARTUP_SNAPSHOT_USER_WRITE_EVENT = "renderer-startup-snapshot:user-write"

type StartupSnapshotFeedRow = {
  id: string
  url: string | null
  title: string | null
  siteUrl: string | null
  image: string | null
  description: string | null
  errorAt: string | null
  errorMessage: string | null
  updatedAt: number | null
}

type StartupSnapshotSubscriptionRow = {
  id: string
  feedId: string | null
  listId: string | null
  inboxId: string | null
  type: string
  view: number
  category: string | null
  title: string | null
  isPrivate: boolean
  hideFromTimeline: boolean
}

type StartupSnapshotUnreadRow = {
  id: string
  count: number
}

type StartupSnapshotEntrySummaryRow = {
  id: string
  feedId: string | null
  inboxHandle: string | null
  title: string | null
  summary: string | null
  publishedAt: number
  insertedAt: number
  read: boolean
  sources: string[]
  author: string | null
}

export type StartupSnapshotPayload = {
  version: number
  savedAt: number
  startupSessionId: string
  dbIdentity: string
  userIdentity: string
  feeds: StartupSnapshotFeedRow[]
  subscriptions: StartupSnapshotSubscriptionRow[]
  unreads: StartupSnapshotUnreadRow[]
  entries: StartupSnapshotEntrySummaryRow[]
}

type StartupSnapshotReason =
  | "interactive"
  | "user_write"
  | "hydrate_critical_done"
  | "pagehide"
  | "visibility_hidden"
  | "electron_close"
  | "renderer_cleanup"

type SnapshotIdentity = {
  dbIdentity: string
  userIdentity: string
  key: string
}

type StartupSnapshotState = {
  startupSessionId: string | null
  debounceMs: number
  interactive: boolean
  dirty: boolean
  hasWritten: boolean
  identityPromise: Promise<SnapshotIdentity> | null
  flushTimer: ReturnType<typeof setTimeout> | null
  resetHookCleanup: (() => void) | null
  listenersBound: boolean
  storeSubscriptions: Array<() => void>
}

const snapshotState: StartupSnapshotState = {
  startupSessionId: null,
  debounceMs: 500,
  interactive: false,
  dirty: false,
  hasWritten: false,
  identityPromise: null,
  flushTimer: null,
  resetHookCleanup: null,
  listenersBound: false,
  storeSubscriptions: [],
}

const encodeSnapshotKeyPart = (value: string) => encodeURIComponent(value || "default")

const getSubscriptionSnapshotId = (subscription: {
  feedId?: string | null
  listId?: string | null
  inboxId?: string | null
  type?: string | null
}) => {
  if (subscription.feedId) return `feed/${subscription.feedId}`
  if (subscription.listId) return `list/${subscription.listId}`
  if (subscription.inboxId) return `inbox/${subscription.inboxId}`
  return `${subscription.type || "subscription"}/unknown`
}

const buildSnapshotStorageKey = ({ dbIdentity, userIdentity }: Omit<SnapshotIdentity, "key">) =>
  [
    STARTUP_SNAPSHOT_NAMESPACE,
    `v${STARTUP_SNAPSHOT_VERSION}`,
    encodeSnapshotKeyPart(userIdentity),
    encodeSnapshotKeyPart(dbIdentity),
  ].join(":")

const resolveUserIdentity = () => useUserStore.getState().whoami?.id ?? LOCAL_USER_ID
const storedUserIdKey = getStorageNS("user_id")

const resolveSnapshotIdentity = async (): Promise<SnapshotIdentity> => {
  if (!snapshotState.identityPromise) {
    snapshotState.identityPromise = (async () => {
      const userIdentity = resolveUserIdentity()
      const dbConfig = await getRendererDbConfig().catch(() => null)
      const dbIdentity = dbConfig?.dbConn?.trim() || "default"

      return {
        dbIdentity,
        userIdentity,
        key: buildSnapshotStorageKey({
          dbIdentity,
          userIdentity,
        }),
      }
    })()
  }

  return snapshotState.identityPromise
}

const buildSnapshotPayload = async (): Promise<StartupSnapshotPayload | null> => {
  const identity = await resolveSnapshotIdentity()
  const routeParams = getRouteParams()
  const entryState = useEntryStore.getState()
  const feeds = Object.values(useFeedStore.getState().feeds).map((feed) => ({
    id: feed.id,
    url: feed.url ?? null,
    title: feed.title ?? null,
    siteUrl: feed.siteUrl ?? null,
    image: feed.image ?? null,
    description: feed.description ?? null,
    errorAt: feed.errorAt ?? null,
    errorMessage: feed.errorMessage ?? null,
    updatedAt: feed.updatedAt ?? null,
  }))
  const subscriptions = Object.values(useSubscriptionStore.getState().data).map((subscription) => ({
    id: getSubscriptionSnapshotId(subscription),
    feedId: subscription.feedId ?? null,
    listId: subscription.listId ?? null,
    inboxId: subscription.inboxId ?? null,
    type: subscription.type,
    view: subscription.view,
    category: subscription.category ?? null,
    title: subscription.title ?? null,
    isPrivate: subscription.isPrivate ?? false,
    hideFromTimeline: subscription.hideFromTimeline ?? false,
  }))
  const unreads = Object.entries(useUnreadStore.getState().data).map(([id, count]) => ({
    id,
    count,
  }))

  const selectEntryIdsForSnapshot = () => {
    if (routeParams.feedId && entryState.entryIdByFeed[routeParams.feedId]) {
      return Array.from(entryState.entryIdByFeed[routeParams.feedId] ?? new Set<string>())
    }
    if (routeParams.inboxId && entryState.entryIdByInbox[routeParams.inboxId]) {
      return Array.from(entryState.entryIdByInbox[routeParams.inboxId] ?? new Set<string>())
    }
    return Array.from(entryState.entryIdByView[routeParams.view] ?? [])
  }

  const entries = selectEntryIdsForSnapshot()
    .map((id) => entryState.data[id])
    .filter((entry): entry is NonNullable<EntryState["data"][string]> => !!entry)
    .slice(0, 200)
    .map((entry) => ({
      id: entry.id,
      feedId: entry.feedId ?? null,
      inboxHandle: entry.inboxHandle ?? null,
      title: entry.title ?? null,
      summary: entry.description ?? null,
      publishedAt: entry.publishedAt,
      insertedAt: entry.insertedAt,
      read: !!entry.read,
      sources: entry.sources ?? [],
      author: entry.author ?? null,
    }))

  const hasRows = feeds.length + subscriptions.length + unreads.length + entries.length > 0
  if (!hasRows && !snapshotState.hasWritten) {
    return null
  }

  return {
    version: STARTUP_SNAPSHOT_VERSION,
    savedAt: Date.now(),
    startupSessionId: snapshotState.startupSessionId || "unknown",
    dbIdentity: identity.dbIdentity,
    userIdentity: identity.userIdentity,
    feeds,
    subscriptions,
    unreads,
    entries,
  }
}

const clearPendingFlush = () => {
  if (snapshotState.flushTimer) {
    clearTimeout(snapshotState.flushTimer)
    snapshotState.flushTimer = null
  }
}

const persistSnapshot = async (reason: StartupSnapshotReason) => {
  if (!snapshotState.interactive) {
    return false
  }

  const identity = await resolveSnapshotIdentity()
  const payload = await buildSnapshotPayload()
  if (!payload) {
    return false
  }

  globalThis.localStorage?.setItem(identity.key, JSON.stringify(payload))
  snapshotState.dirty = false
  snapshotState.hasWritten = true
  appLog("[startup] snapshot persisted", reason)
  return true
}

const handleUserWriteEvent = () => {
  queueStartupSnapshotRefresh("user_write")
}

const handlePageHide = () => {
  void flushStartupSnapshot("pagehide")
}

const handleVisibilityChange = () => {
  if (document.hidden) {
    void flushStartupSnapshot("visibility_hidden")
  }
}

const handleElectronClose = () => {
  void flushStartupSnapshot("electron_close")
}

const subscribeStoreForUserWriteRefresh = (subscribe: (listener: () => void) => () => void) =>
  subscribe(() => {
    if (getHydratePhaseState().currentSource === "user_write") {
      queueStartupSnapshotRefresh("user_write")
    }
  })

const bindSnapshotLifecycle = () => {
  if (snapshotState.listenersBound) {
    return
  }

  const windowTarget =
    typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null

  document.addEventListener(STARTUP_SNAPSHOT_USER_WRITE_EVENT, handleUserWriteEvent)
  windowTarget?.addEventListener("pagehide", handlePageHide)
  document.addEventListener("visibilitychange", handleVisibilityChange)
  document.addEventListener(ElectronCloseEvent.type, handleElectronClose)
  snapshotState.listenersBound = true
}

const unbindSnapshotLifecycle = () => {
  if (!snapshotState.listenersBound) {
    return
  }

  const windowTarget =
    typeof window !== "undefined" && typeof window.removeEventListener === "function"
      ? window
      : null

  document.removeEventListener(STARTUP_SNAPSHOT_USER_WRITE_EVENT, handleUserWriteEvent)
  windowTarget?.removeEventListener("pagehide", handlePageHide)
  document.removeEventListener("visibilitychange", handleVisibilityChange)
  document.removeEventListener(ElectronCloseEvent.type, handleElectronClose)
  snapshotState.listenersBound = false
}

const isSnapshotPayload = (value: unknown): value is StartupSnapshotPayload => {
  if (!value || typeof value !== "object") {
    return false
  }

  const payload = value as Partial<StartupSnapshotPayload>
  return (
    payload.version === STARTUP_SNAPSHOT_VERSION &&
    Array.isArray(payload.feeds) &&
    Array.isArray(payload.subscriptions) &&
    Array.isArray(payload.unreads) &&
    Array.isArray(payload.entries) &&
    typeof payload.dbIdentity === "string" &&
    typeof payload.userIdentity === "string"
  )
}

export const initializeStartupSnapshot = ({
  startupSessionId,
  debounceMs = 500,
}: {
  startupSessionId: string
  debounceMs?: number
}) => {
  clearPendingFlush()

  snapshotState.startupSessionId = startupSessionId
  snapshotState.debounceMs = debounceMs
  snapshotState.interactive = false
  snapshotState.dirty = false
  snapshotState.hasWritten = false
  snapshotState.identityPromise = null
  snapshotState.storeSubscriptions.forEach((unsubscribe) => unsubscribe())
  snapshotState.storeSubscriptions = []

  snapshotState.resetHookCleanup?.()
  snapshotState.resetHookCleanup = registerRendererPersistResetHook(async () => {
    await flushStartupSnapshot("renderer_cleanup")
    await clearStartupSnapshotsByNamespace()
  })

  bindSnapshotLifecycle()
  snapshotState.storeSubscriptions = [
    subscribeStoreForUserWriteRefresh(useFeedStore.subscribe),
    subscribeStoreForUserWriteRefresh(useSubscriptionStore.subscribe),
    subscribeStoreForUserWriteRefresh(useUnreadStore.subscribe),
    subscribeStoreForUserWriteRefresh(useEntryStore.subscribe),
  ]
}

export const restoreStartupSnapshot = async (): Promise<StartupSnapshotRestoreResult> => {
  const startedAt = performance.now()

  if (!globalThis.localStorage) {
    recordSnapshotRestoreResult("skipped")
    return "skipped"
  }

  const identity = await resolveSnapshotIdentity()
  const raw = globalThis.localStorage.getItem(identity.key)

  if (!raw) {
    recordSnapshotRestoreResult("miss")
    return "miss"
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (
      parsed &&
      typeof parsed === "object" &&
      "version" in parsed &&
      (parsed as { version?: number }).version !== STARTUP_SNAPSHOT_VERSION
    ) {
      recordSnapshotRestoreResult("old_version")
      return "old_version"
    }

    if (!isSnapshotPayload(parsed)) {
      recordSnapshotRestoreResult("corrupt")
      return "corrupt"
    }

    runWithHydrateSource("snapshot_restore", () => {
      feedActions.upsertManyInSession(parsed.feeds as never)
      subscriptionActions.replaceManyInSession(
        parsed.subscriptions.map(({ id: _id, ...subscription }) => subscription) as never,
      )
      unreadActions.restoreHydratedSnapshotInSession(parsed.unreads as never)
      entryActions.restoreHydratedSnapshotInSession(parsed.entries as never)
    })

    recordStartupMetric("snapshot_restore_ms", performance.now() - startedAt)
    recordSnapshotRestoreResult("hit")
    return "hit"
  } catch (error) {
    recordSnapshotRestoreResult("corrupt")
    appLog(
      "[startup] snapshot restore failed",
      error instanceof Error ? error.message : String(error),
    )
    return "corrupt"
  }
}

export const markStartupSnapshotInteractive = async () => {
  snapshotState.interactive = true
  await persistSnapshot("interactive")
}

export const queueStartupSnapshotRefresh = (
  reason: Extract<StartupSnapshotReason, "user_write">,
) => {
  if (!snapshotState.interactive) {
    return
  }

  snapshotState.dirty = true
  clearPendingFlush()
  snapshotState.flushTimer = setTimeout(() => {
    snapshotState.flushTimer = null
    void persistSnapshot(reason)
  }, snapshotState.debounceMs)
}

export const emitStartupSnapshotUserWrite = () => {
  document.dispatchEvent(new Event(STARTUP_SNAPSHOT_USER_WRITE_EVENT))
}

export const forceStartupSnapshotRefresh = async () => {
  clearPendingFlush()
  snapshotState.dirty = true
  await persistSnapshot("hydrate_critical_done")
}

export const flushStartupSnapshot = async (
  reason: Exclude<StartupSnapshotReason, "interactive" | "user_write" | "hydrate_critical_done">,
) => {
  if (!snapshotState.dirty) {
    clearPendingFlush()
    return false
  }

  clearPendingFlush()
  return persistSnapshot(reason)
}

export const clearStartupSnapshot = async () => {
  const identity = await resolveSnapshotIdentity()
  globalThis.localStorage?.removeItem(identity.key)
}

export const clearStartupSnapshotsByNamespace = async () => {
  if (!globalThis.localStorage) return
  const prefix = `${STARTUP_SNAPSHOT_NAMESPACE}:v${STARTUP_SNAPSHOT_VERSION}:`
  const keys: string[] = []
  for (let i = 0; i < globalThis.localStorage.length; i += 1) {
    const key = globalThis.localStorage.key(i)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  for (const key of keys) {
    globalThis.localStorage.removeItem(key)
  }
}

export const clearStartupSnapshotsForUserChange = async (newUserId?: string | null) => {
  const oldUserId = globalThis.localStorage?.getItem(storedUserIdKey)
  if (oldUserId && newUserId && oldUserId === newUserId) {
    return
  }
  await clearStartupSnapshotsByNamespace()
}

export const getStartupSnapshotStorageKeyForTests = async () => {
  const identity = await resolveSnapshotIdentity()
  return identity.key
}

export const resetStartupSnapshotForTests = () => {
  clearPendingFlush()
  snapshotState.resetHookCleanup?.()
  snapshotState.resetHookCleanup = null
  snapshotState.startupSessionId = null
  snapshotState.debounceMs = 500
  snapshotState.interactive = false
  snapshotState.dirty = false
  snapshotState.hasWritten = false
  snapshotState.identityPromise = null
  snapshotState.storeSubscriptions.forEach((unsubscribe) => unsubscribe())
  snapshotState.storeSubscriptions = []
  unbindSnapshotLifecycle()
}
