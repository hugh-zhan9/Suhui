import type { UnreadSchema } from "@suhui/database/schemas/types"
import { parseEntryChangeEventV1, type EntryChangeEventV1 } from "@suhui/shared/entry-change"
import type { Query, QueryClient } from "@tanstack/react-query"

import { queryClient } from "../../context"
import { getEntryListQueryDescriptor, type EntryListQueryDescriptor } from "./hooks"

export type { EntryListQueryDescriptor } from "./hooks"

export type EntryChangeHandleResult = "handled" | "duplicate" | "ignored-invalid"
export type EntryChangeOrigin = "response" | "ipc" | "sse"

export type RefreshRendererRefetchMetric = {
  metric: "refresh_renderer_refetch_count"
  batchId: string
  value: number
}

export interface EntryChangeInvalidationCoordinator {
  handle(change: unknown, origin: EntryChangeOrigin): Promise<EntryChangeHandleResult>
  handleReconnect(): Promise<void>
  resetForTests(): void
}

export interface EntryChangeInvalidationCoordinatorDependencies {
  getQueryClient(): QueryClient
  refreshUnread(): Promise<void>
  refreshCollections(): Promise<void>
  refreshSubscriptions(): Promise<void>
  refreshBootstrap(): Promise<void>
  settleReadEntries(entryIds: string[]): Promise<void>
  now(): number
  recordRefreshRendererRefetchCount(metric: RefreshRendererRefetchMetric): void
}

const processedBatchTtlMs = 5 * 60 * 1_000
const processedBatchLimit = 512

type EntryQueryPredicate = (query: Query) => boolean

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

const getCachedEntryItems = (data: unknown) => {
  if (!isRecord(data)) return []
  const pages = Array.isArray(data.pages) ? data.pages : [data]
  const items: Record<string, unknown>[] = []

  for (const page of pages) {
    if (!isRecord(page)) continue
    const pageItems = Array.isArray(page.items)
      ? page.items
      : Array.isArray(page.data)
        ? page.data
        : []
    for (const item of pageItems) {
      if (isRecord(item)) items.push(item)
    }
  }

  return items
}

const cachedQueryContainsFeed = (query: Query, feedIds: Set<string>) =>
  getCachedEntryItems(query.state.data).some(
    (entry) => typeof entry.feedId === "string" && feedIds.has(entry.feedId),
  )

const cachedQueryContainsEntry = (query: Query, entryIds: Set<string>) =>
  getCachedEntryItems(query.state.data).some(
    (entry) => typeof entry.id === "string" && entryIds.has(entry.id),
  )

const getDescriptor = (query: Query) => getEntryListQueryDescriptor(query.queryKey)

const createRefreshPredicate = (feedIds: string[]): EntryQueryPredicate => {
  const changedFeedIds = new Set(feedIds)
  return (query) => {
    const descriptor = getDescriptor(query)
    if (!descriptor) return false

    switch (descriptor.scope.kind) {
      case "timeline":
        return changedFeedIds.size > 0
      case "feeds":
        return descriptor.scope.feedIds.some((feedId) => changedFeedIds.has(feedId))
      case "list":
      case "inbox":
      case "collection":
        return cachedQueryContainsFeed(query, changedFeedIds)
      default: {
        const exhaustiveScope: never = descriptor.scope
        return exhaustiveScope
      }
    }
  }
}

const createReadPredicate = (entryIds: string[]): EntryQueryPredicate => {
  const changedEntryIds = new Set(entryIds)
  return (query) => !!getDescriptor(query) && cachedQueryContainsEntry(query, changedEntryIds)
}

const collectionPredicate: EntryQueryPredicate = (query) =>
  getDescriptor(query)?.scope.kind === "collection"

const allEntriesPredicate: EntryQueryPredicate = (query) => !!getDescriptor(query)

const defaultRefreshUnread = async () => {
  const [{ getRuntimeEnv }, { unreadActions }] = await Promise.all([
    import("../../remote/env"),
    import("../unread/store"),
  ])

  if (!getRuntimeEnv().isRemote) {
    await unreadActions.hydrate()
    return
  }

  const [{ runtimeClient }, { transformUnreadsFromApi }] = await Promise.all([
    import("../../runtime"),
    import("../../remote/transforms"),
  ])
  const unreads = transformUnreadsFromApi(await runtimeClient.unread.list())
  unreadActions.upsertManyInSession(unreads as unknown as UnreadSchema[], {
    reset: true,
    source: "runtime",
  })
}

const defaultRefreshCollections = async () => {
  const [{ getRuntimeEnv }, { collectionActions }] = await Promise.all([
    import("../../remote/env"),
    import("../collection/store"),
  ])

  if (!getRuntimeEnv().isRemote) {
    await collectionActions.hydrate()
    return
  }

  const { runtimeClient } = await import("../../runtime")
  const collections = await runtimeClient.collections.list()
  collectionActions.upsertManyInSession(collections, { reset: true })
}

const defaultRefreshSubscriptions = async () => {
  const [{ subscriptionActions, subscriptionSyncService }, { feedActions }] = await Promise.all([
    import("../subscription/store"),
    import("../feed/store"),
  ])
  const { subscriptions, feeds } = await subscriptionSyncService.fetch()
  subscriptionActions.replaceManyInSession(subscriptions)
  feedActions.upsertManyInSession(feeds as any)
}

const defaultRefreshBootstrap = async () => {
  await Promise.all([
    defaultRefreshSubscriptions(),
    defaultRefreshUnread(),
    defaultRefreshCollections(),
  ])
}

const defaultSettleReadEntries = async (entryIds: string[]) => {
  const { entryActions } = await import("./store")
  entryActions.markReadMutationSettled(entryIds)
}

const defaultRecordRefreshRendererRefetchCount = (metric: RefreshRendererRefetchMetric) => {
  console.info("[PerformanceMetric]", metric)
}

const defaultDependencies: EntryChangeInvalidationCoordinatorDependencies = {
  getQueryClient: queryClient,
  refreshUnread: defaultRefreshUnread,
  refreshCollections: defaultRefreshCollections,
  refreshSubscriptions: defaultRefreshSubscriptions,
  refreshBootstrap: defaultRefreshBootstrap,
  settleReadEntries: defaultSettleReadEntries,
  now: Date.now,
  recordRefreshRendererRefetchCount: defaultRecordRefreshRendererRefetchCount,
}

export const createEntryChangeInvalidationCoordinator = (
  dependencies: EntryChangeInvalidationCoordinatorDependencies,
): EntryChangeInvalidationCoordinator => {
  const processedBatchIds = new Map<string, number>()
  const inFlightBatches = new Map<string, Promise<void>>()
  let calibrationTail = Promise.resolve()

  const pruneProcessedBatchIds = (now: number) => {
    for (const [batchId, processedAt] of processedBatchIds) {
      if (now - processedAt <= processedBatchTtlMs) continue
      processedBatchIds.delete(batchId)
    }

    while (processedBatchIds.size > processedBatchLimit) {
      const oldestBatchId = processedBatchIds.keys().next().value
      if (oldestBatchId === undefined) break
      processedBatchIds.delete(oldestBatchId)
    }
  }

  const invalidateMatchingEntries = async (predicate: EntryQueryPredicate) => {
    const client = dependencies.getQueryClient()
    const activeRefetchCount = client
      .getQueryCache()
      .findAll({ predicate })
      .filter((query) => query.isActive()).length

    await client.invalidateQueries({ predicate, refetchType: "active" })
    return activeRefetchCount
  }

  const handleRefresh = async (entryChange: EntryChangeEventV1) => {
    const refetchCount =
      entryChange.feedIds.length === 0
        ? 0
        : await invalidateMatchingEntries(createRefreshPredicate(entryChange.feedIds))
    dependencies.recordRefreshRendererRefetchCount({
      metric: "refresh_renderer_refetch_count",
      batchId: entryChange.batchId,
      value: refetchCount,
    })
    await dependencies.refreshUnread()
  }

  const handleRead = async (entryChange: EntryChangeEventV1) => {
    const entryIds = entryChange.entryIds ?? []
    await dependencies.settleReadEntries(entryIds)
    await Promise.all([
      entryIds.length > 0
        ? invalidateMatchingEntries(createReadPredicate(entryIds)).then(() => undefined)
        : Promise.resolve(),
      dependencies.refreshUnread(),
    ])
  }

  const handleCollection = async () => {
    await Promise.all([
      invalidateMatchingEntries(collectionPredicate),
      dependencies.refreshCollections(),
    ])
  }

  const handleAllEntryScopes = async () => {
    await Promise.all([
      invalidateMatchingEntries(allEntriesPredicate),
      dependencies.refreshUnread(),
      dependencies.refreshCollections(),
      dependencies.refreshSubscriptions(),
    ])
  }

  const applyChange = async (entryChange: EntryChangeEventV1) => {
    switch (entryChange.reason) {
      case "refresh":
        await handleRefresh(entryChange)
        return
      case "read":
        await handleRead(entryChange)
        return
      case "collection":
        await handleCollection()
        return
      case "subscription":
      case "import":
        await handleAllEntryScopes()
        return
      default: {
        const exhaustiveReason: never = entryChange.reason
        return exhaustiveReason
      }
    }
  }

  const enqueueCalibration = (calibrate: () => Promise<void>) => {
    const completion = calibrationTail.then(calibrate)
    calibrationTail = completion.catch(() => undefined)
    return completion
  }

  return {
    async handle(change: unknown, _origin: EntryChangeOrigin) {
      const entryChange = parseEntryChangeEventV1(change)
      if (!entryChange) return "ignored-invalid"

      const now = dependencies.now()
      pruneProcessedBatchIds(now)

      const inFlight = inFlightBatches.get(entryChange.batchId)
      if (inFlight) {
        await inFlight
        return "duplicate"
      }
      if (processedBatchIds.has(entryChange.batchId)) return "duplicate"

      processedBatchIds.set(entryChange.batchId, now)
      pruneProcessedBatchIds(now)

      const completion = enqueueCalibration(() => applyChange(entryChange))
      inFlightBatches.set(entryChange.batchId, completion)

      try {
        await completion
        return "handled"
      } finally {
        if (inFlightBatches.get(entryChange.batchId) === completion) {
          inFlightBatches.delete(entryChange.batchId)
          const completedAt = dependencies.now()
          processedBatchIds.delete(entryChange.batchId)
          processedBatchIds.set(entryChange.batchId, completedAt)
          pruneProcessedBatchIds(completedAt)
        }
      }
    },

    async handleReconnect() {
      await enqueueCalibration(async () => {
        await Promise.all([
          invalidateMatchingEntries(allEntriesPredicate),
          dependencies.refreshBootstrap(),
        ])
      })
    },

    resetForTests() {
      processedBatchIds.clear()
      inFlightBatches.clear()
      calibrationTail = Promise.resolve()
    },
  }
}

export const entryChangeInvalidationCoordinator =
  createEntryChangeInvalidationCoordinator(defaultDependencies)
