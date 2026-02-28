import { FeedViewType, getView } from "@follow/constants"
import { useCollectionEntryList } from "@follow/store/collection/hooks"
import { isOnboardingEntryUrl } from "@follow/store/constants/onboarding"
import {
  useEntryIdsByFeedId,
  useEntryIdsByFeedIds,
  useEntryIdsByInboxId,
  useEntryIdsByListId,
  useEntryIdsByView,
} from "@follow/store/entry/hooks"
import { entryActions, useEntryStore } from "@follow/store/entry/store"
import type { UseEntriesReturn } from "@follow/store/entry/types"
import { fallbackReturn } from "@follow/store/entry/utils"
import { useFolderFeedsByFeedId, useIsSubscribed } from "@follow/store/subscription/hooks"
import { unreadSyncService } from "@follow/store/unread/store"
import { isBizId } from "@follow/utils/utils"
import { debounce } from "es-toolkit/compat"
import { useCallback, useEffect, useMemo, useState } from "react"

import { useGeneralSettingKey } from "~/atoms/settings/general"
import { ROUTE_FEED_PENDING } from "~/constants/app"
import { useRouteParams } from "~/hooks/biz/useRouteParams"

import {
  normalizeFeedIdForActiveSubscription,
  shouldFilterUnreadEntries,
} from "./query-selection"
import { dedupeEntryIdsPreserveOrder } from "./entry-id-utils"

function getEntryIdsFromMultiplePlace(...entryIds: Array<string[] | undefined | null>) {
  return entryIds.find((ids) => ids?.length) ?? []
}

const useLocalEntries = (): UseEntriesReturn => {
  const { feedId, view, inboxId, listId, isCollection, isPendingEntry } = useRouteParams()
  const unreadOnly = useGeneralSettingKey("unreadOnly")
  const hidePrivateSubscriptionsInTimeline = useGeneralSettingKey(
    "hidePrivateSubscriptionsInTimeline",
  )

  const folderIds = useFolderFeedsByFeedId({
    feedId,
    view,
  })
  const isSubscribed = useIsSubscribed(feedId)
  const allowUnsubscribedFeed = !isSubscribed && isPendingEntry
  const activeFeedId = useMemo(
    () =>
      normalizeFeedIdForActiveSubscription({
        feedId,
        pendingFeedId: ROUTE_FEED_PENDING,
        isSubscribed,
        allowUnsubscribedFeed,
      }),
    [feedId, isSubscribed, allowUnsubscribedFeed],
  )
  const entryIdsByView = useEntryIdsByView(view, hidePrivateSubscriptionsInTimeline)
  const entryIdsByCollections = useCollectionEntryList(view)
  const entryIdsByFeedId = useEntryIdsByFeedId(activeFeedId)
  const entryIdsByCategory = useEntryIdsByFeedIds(folderIds)
  const entryIdsByListId = useEntryIdsByListId(listId)
  const entryIdsByInboxId = useEntryIdsByInboxId(inboxId)

  const showEntriesByView =
    !activeFeedId &&
    folderIds.length === 0 &&
    !isCollection &&
    !inboxId &&
    !listId

  const allEntries = useEntryStore(
    useCallback(
      (state) => {
        const ids = isCollection
          ? entryIdsByCollections
          : showEntriesByView
            ? (entryIdsByView ?? [])
            : (getEntryIdsFromMultiplePlace(
                entryIdsByFeedId,
                entryIdsByCategory,
                entryIdsByListId,
                entryIdsByInboxId,
              ) ?? [])

        return dedupeEntryIdsPreserveOrder(
          ids
          .map((id) => {
            const entry = state.data[id]
            if (!entry) return null
            if (
              shouldFilterUnreadEntries({
                isCollection: !!isCollection,
                unreadOnly: Boolean(unreadOnly),
              }) &&
              entry.read
            ) {
              return null
            }
            return entry.id
          })
          .filter((id) => typeof id === "string"),
        )
      },
      [
        entryIdsByCategory,
        entryIdsByCollections,
        entryIdsByFeedId,
        entryIdsByInboxId,
        entryIdsByListId,
        entryIdsByView,
        isCollection,
        showEntriesByView,
        unreadOnly,
      ],
    ),
  )

  const [page, setPage] = useState(0)
  const pageSize = 30
  const totalPage = useMemo(
    () => (allEntries ? Math.ceil(allEntries.length / pageSize) : 0),
    [allEntries],
  )

  const entries = useMemo(() => {
    return dedupeEntryIdsPreserveOrder(allEntries?.slice(0, (page + 1) * pageSize) || [])
  }, [allEntries, page, pageSize])

  const hasNext = useMemo(() => {
    return entries.length < (allEntries?.length || 0)
  }, [entries.length, allEntries])

  const refetch = useCallback(async () => {
    setPage(0)
  }, [])

  const fetchNextPage = useCallback(
    debounce(async () => {
      setPage(page + 1)
    }, 300),
    [page],
  )

  useEffect(() => {
    setPage(0)
  }, [view, activeFeedId])

  return {
    entriesIds: entries,
    hasNext,
    refetch,
    fetchNextPage: fetchNextPage as () => Promise<void>,
    isLoading: false,
    isRefetching: false,
    isReady: true,
    isFetchingNextPage: false,
    isFetching: false,
    hasNextPage: page < totalPage,
    error: null,
  }
}

export const useEntriesByView = ({ onReset }: { onReset?: () => void }) => {
  const { view, listId, isCollection } = useRouteParams()

  const localQuery = useLocalEntries()
  const query = localQuery
  const entryIds: string[] = useMemo(
    () => dedupeEntryIdsPreserveOrder(query.entriesIds || []),
    [query.entriesIds],
  )

  const isFetchingFirstPage = query.isFetching && !query.isFetchingNextPage

  useEffect(() => {
    if (isFetchingFirstPage) {
      onReset?.()
    }
  }, [isFetchingFirstPage, onReset, query.queryKey])

  const groupByDate = useGeneralSettingKey("groupByDate")
  const groupedCounts: number[] | undefined = useMemo(() => {
    const viewDefinition = getView(view)
    if (viewDefinition?.gridMode || view === FeedViewType.All) {
      return
    }
    if (!groupByDate) {
      return
    }
    const entriesId2Map = entryActions.getFlattenMapEntries()
    const counts = [] as number[]
    let lastDate = ""
    for (const id of entryIds) {
      const entry = entriesId2Map[id]
      if (!entry) {
        continue
      }
      if (isOnboardingEntryUrl(entry.url)) {
        continue
      }
      const date = new Date(listId ? entry.insertedAt : entry.publishedAt).toDateString()
      if (date !== lastDate) {
        counts.push(1)
        lastDate = date
      } else {
        const last = counts.pop()
        if (last) counts.push(last + 1)
      }
    }

    return counts
  }, [groupByDate, listId, entryIds, view])

  return {
    ...query,

    type: "local" as const,
    refetch: useCallback(() => {
      const promise = query.refetch()
      unreadSyncService.resetFromRemote()
      return promise
    }, [query]),
    entriesIds: entryIds,
    groupedCounts,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
  }
}
