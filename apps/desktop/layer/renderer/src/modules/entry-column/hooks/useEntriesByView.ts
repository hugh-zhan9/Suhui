import { FeedViewType, getView } from "@suhui/constants"
import { useEntriesQuery } from "@suhui/store/entry/hooks"
import { entryActions, useEntryStore } from "@suhui/store/entry/store"
import type { FetchEntriesProps, FetchEntriesPropsSettings } from "@suhui/store/entry/types"
import { getRuntimeEnv } from "@suhui/store/remote"
import { toEntryListQuery } from "@suhui/store/runtime/client"
import { useIsSubscribed, useFolderFeedsByFeedId } from "@suhui/store/subscription/hooks"
import { unreadSyncService } from "@suhui/store/unread/store"
import { useCallback, useEffect, useMemo } from "react"

import { useStartupReadiness } from "~/atoms/app"
import { useGeneralSettingKey } from "~/atoms/settings/general"
import { ROUTE_FEED_PENDING } from "~/constants/app"
import type { BizRouteParams } from "~/hooks/biz/useRouteParams"
import { useRouteParams } from "~/hooks/biz/useRouteParams"
import { markDesktopInitialEntriesReady } from "~/initialize/readiness"

import { dedupeEntryIdsPreserveOrder } from "./entry-id-utils"
import {
  getPendingActiveEntryId,
  normalizeFeedIdForActiveSubscription,
  setPendingActiveEntryId,
} from "./query-selection"

type EntriesByViewQueryProps = Omit<FetchEntriesProps, "pageParam" | "read" | "excludePrivate"> &
  FetchEntriesPropsSettings

const normalizeFeedIds = (feedIds: string[]) =>
  Array.from(new Set(feedIds.map((id) => id.trim()).filter(Boolean))).sort()

export const buildEntriesByViewQueryProps = ({
  route,
  folderFeedIds,
  activeFeedId,
  unreadOnly,
  hidePrivateSubscriptionsInTimeline,
}: {
  route: BizRouteParams
  folderFeedIds: string[]
  activeFeedId?: string
  unreadOnly: boolean
  hidePrivateSubscriptionsInTimeline: boolean
}): EntriesByViewQueryProps => {
  if (route.isCollection) {
    return {
      isCollection: true,
      ...(route.view === FeedViewType.All ? {} : { view: route.view }),
      unreadOnly: false,
    }
  }
  if (route.listId) return { listId: route.listId, unreadOnly }
  if (route.inboxId) return { inboxId: route.inboxId, unreadOnly }
  if (activeFeedId) return { feedId: activeFeedId, unreadOnly }

  const normalizedFolderFeedIds = normalizeFeedIds(folderFeedIds)
  if (normalizedFolderFeedIds.length > 0) {
    return { feedIdList: normalizedFolderFeedIds, unreadOnly }
  }

  return {
    ...(route.view === FeedViewType.All ? {} : { view: route.view }),
    unreadOnly,
    hidePrivateSubscriptionsInTimeline,
  }
}

export const getEntriesByViewQueryIdentity = (props: EntriesByViewQueryProps) =>
  toEntryListQuery({
    ...props,
    pageParam: undefined,
    read: props.unreadOnly ? false : undefined,
    excludePrivate: props.hidePrivateSubscriptionsInTimeline,
  })

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
  const { routeScopeReady } = useStartupReadiness()
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
  const query = useEntriesQuery({
    ...queryProps,
    enabled: isRemote || routeScopeReady,
  })

  const firstPage = query.data?.pages?.[0]
  useEffect(() => {
    if (isRemote || !routeScopeReady || !query.isSuccess || !firstPage) {
      return
    }

    markDesktopInitialEntriesReady(firstPage.data.length)
  }, [firstPage, isRemote, query.isSuccess, routeScopeReady])
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
