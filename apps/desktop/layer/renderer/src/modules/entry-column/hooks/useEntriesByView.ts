import { FeedViewType, getView } from "@suhui/constants"
import { useEntriesQuery } from "@suhui/store/entry/hooks"
import { entryActions, useEntryStore } from "@suhui/store/entry/store"
import { getRuntimeEnv } from "@suhui/store/remote"
import { useIsSubscribed, useFolderFeedsByFeedId } from "@suhui/store/subscription/hooks"
import { unreadSyncService } from "@suhui/store/unread/store"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"

import { useStartupReadinessSelector } from "~/atoms/app"
import { useGeneralSettingKey } from "~/atoms/settings/general"
import { ROUTE_FEED_PENDING } from "~/constants/app"
import { useRouteParams } from "~/hooks/biz/useRouteParams"
import {
  getRouteScopeReadyAt,
  markDesktopInitialEntriesReady,
  markDesktopInitialEntriesTerminalError,
} from "~/initialize/readiness"

import { dedupeEntryIdsPreserveOrder } from "./entry-id-utils"
import { buildEntriesByViewQueryProps, getEntriesByViewQueryIdentity } from "./entries-query-props"
import {
  getPendingActiveEntryId,
  normalizeFeedIdForActiveSubscription,
  setPendingActiveEntryId,
} from "./query-selection"

export { buildEntriesByViewQueryProps, getEntriesByViewQueryIdentity } from "./entries-query-props"

export const includeActiveEntryInQueryPageOrder = ({
  pageIds,
  activeEntryId,
  activeEntryLoaded,
}: {
  pageIds: string[]
  activeEntryId?: string
  activeEntryLoaded: boolean
}) =>
  dedupeEntryIdsPreserveOrder(
    activeEntryId && activeEntryLoaded && !pageIds.includes(activeEntryId)
      ? [activeEntryId, ...pageIds]
      : pageIds,
  )

export const isEntriesQueryReady = (query: { isSuccess: boolean }) => query.isSuccess

export const useEntriesByView = ({ onReset }: { onReset?: () => void }) => {
  const route = useRouteParams()
  const routeScopeReady = useStartupReadinessSelector((state) => state.routeScopeReady)
  const startupSessionId = useStartupReadinessSelector((state) => state.startupSessionId)
  const isRemote = getRuntimeEnv().isRemote
  const { view, listId, entryId: activeEntryId } = route
  const unreadOnly = useGeneralSettingKey("unreadOnly")
  const hidePrivateSubscriptionsInTimeline = useGeneralSettingKey(
    "hidePrivateSubscriptionsInTimeline",
  )
  const folderFeedIds = useFolderFeedsByFeedId({ feedId: route.feedId, view })
  const isSubscribed = useIsSubscribed(route.feedId)
  const activeFeedId = useMemo(
    () =>
      normalizeFeedIdForActiveSubscription({
        feedId: route.feedId,
        pendingFeedId: ROUTE_FEED_PENDING,
        isSubscribed,
        allowUnsubscribedFeed: !isSubscribed && route.isPendingEntry,
      }),
    [isSubscribed, route.feedId, route.isPendingEntry],
  )
  const queryProps = useMemo(
    () =>
      buildEntriesByViewQueryProps({
        route,
        folderFeedIds,
        activeFeedId,
        unreadOnly: Boolean(unreadOnly),
        hidePrivateSubscriptionsInTimeline: Boolean(hidePrivateSubscriptionsInTimeline),
      }),
    [activeFeedId, folderFeedIds, hidePrivateSubscriptionsInTimeline, route, unreadOnly],
  )
  const queryEnabled = isRemote || routeScopeReady
  const queryIdentity = JSON.stringify(getEntriesByViewQueryIdentity(queryProps))
  const metricIdentity = JSON.stringify([startupSessionId, queryIdentity])
  const queryTimingRef = useRef<
    { startupSessionId: string | null; identity: string; startedAt: number } | undefined
  >(undefined)
  if (
    !isRemote &&
    queryEnabled &&
    (!queryTimingRef.current ||
      queryTimingRef.current.identity !== queryIdentity ||
      queryTimingRef.current.startupSessionId !== startupSessionId)
  ) {
    const startsNewSession = queryTimingRef.current?.startupSessionId !== startupSessionId
    queryTimingRef.current = {
      startupSessionId,
      identity: queryIdentity,
      startedAt: startsNewSession
        ? (getRouteScopeReadyAt() ?? performance.now())
        : performance.now(),
    }
  }
  const query = useEntriesQuery({
    ...queryProps,
    enabled: queryEnabled,
  })

  const firstPage = query.data?.pages?.[0]
  const recordedUsableMetricsRef = useRef(new Set<string>())
  useLayoutEffect(() => {
    const queryTiming = queryTimingRef.current
    if (isRemote || !routeScopeReady) {
      return
    }

    if (query.isError) {
      markDesktopInitialEntriesTerminalError()
      return
    }

    if (
      !query.isSuccess ||
      !firstPage ||
      !queryTiming ||
      queryTiming.identity !== queryIdentity ||
      queryTiming.startupSessionId !== startupSessionId
    ) {
      return
    }

    markDesktopInitialEntriesReady(firstPage.data.length)
    const metric = queryProps.unreadOnly ? "desktop_unread_usable_ms" : "desktop_feed_usable_ms"
    if (!recordedUsableMetricsRef.current.has(metricIdentity)) {
      recordedUsableMetricsRef.current.add(metricIdentity)
      console.info("[PerformanceMetric]", {
        metric,
        value: Math.max(0, Math.round((performance.now() - queryTiming.startedAt) * 100) / 100),
      })
    }
  }, [
    firstPage,
    isRemote,
    metricIdentity,
    query.isError,
    query.isSuccess,
    queryIdentity,
    queryProps.unreadOnly,
    routeScopeReady,
    startupSessionId,
  ])
  const activeEntryLoaded = useEntryStore((state) =>
    activeEntryId ? Boolean(state.data[activeEntryId]) : false,
  )
  const entryIds = useMemo(
    () =>
      includeActiveEntryInQueryPageOrder({
        pageIds: query.entriesIds,
        activeEntryId,
        activeEntryLoaded,
      }),
    [activeEntryId, activeEntryLoaded, query.entriesIds],
  )

  const pendingActiveEntryId = getPendingActiveEntryId()
  useEffect(() => {
    if (!activeEntryId || pendingActiveEntryId !== activeEntryId) return
    setPendingActiveEntryId(null)
  }, [activeEntryId, pendingActiveEntryId])

  const isFetchingFirstPage = query.isFetching && !query.isFetchingNextPage
  useEffect(() => {
    if (isFetchingFirstPage) onReset?.()
  }, [isFetchingFirstPage, onReset, query.queryKey])

  const groupByDate = useGeneralSettingKey("groupByDate")
  const groupedCounts: number[] | undefined = useMemo(() => {
    const viewDefinition = getView(view)
    if (viewDefinition?.gridMode || view === FeedViewType.All || !groupByDate) return

    const entriesById = entryActions.getFlattenMapEntries()
    const counts: number[] = []
    let lastDate = ""
    for (const id of entryIds) {
      const entry = entriesById[id]
      if (!entry) continue
      const date = new Date(listId ? entry.insertedAt : entry.publishedAt).toDateString()
      if (date !== lastDate) {
        counts.push(1)
        lastDate = date
      } else {
        counts[counts.length - 1] = (counts[counts.length - 1] ?? 0) + 1
      }
    }
    return counts
  }, [entryIds, groupByDate, listId, view])

  return {
    ...query,
    type: isRemote ? ("remote" as const) : ("local" as const),
    fetchNextPage: async () => {
      await query.fetchNextPage()
    },
    refetch: useCallback(async () => {
      await query.refetch()
      unreadSyncService.resetFromRemote()
    }, [query]),
    entriesIds: entryIds,
    groupedCounts,
    isReady: isEntriesQueryReady(query),
    fetchedTime: query.dataUpdatedAt,
  }
}
