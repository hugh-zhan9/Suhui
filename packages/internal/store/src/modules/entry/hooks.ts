import { FeedViewType } from "@suhui/constants"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"

import { FEED_COLLECTION_LIST } from "../../constants/app"
import { queryClient } from "../../context"
import { toEntryListQuery } from "../../runtime/client"
import { useFeedUnreadIsDirty } from "../feed/hooks"
import { useSyncUnreadWhenUnMatch } from "../unread/hooks"
import {
  getEntry,
  getEntryIdsByCategorySelector,
  getEntryIdsByFeedIdSelector,
  getEntryIdsByFeedIdsSelector,
  getEntryIdsByInboxIdSelector,
  getEntryIdsByListIdSelector,
  getEntryIdsByViewSelector,
  getEntryIsInboxSelector,
  getHasEntrySelector,
} from "./getter"
import { entryActions, entrySyncServices, useEntryStore } from "./store"
import type {
  EntryModel,
  EntryQueryHookPage,
  FetchEntriesProps,
  FetchEntriesPropsSettings,
  RuntimeEntryListQuery,
} from "./types"

export type EntryListQueryDescriptor = Pick<RuntimeEntryListQuery, "scope" | "read">

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

const normalizeDescriptorId = (value: unknown) => {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized || null
}

const normalizeDescriptorView = (value: unknown) => {
  if (value === undefined || value === FeedViewType.All) return undefined
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

export const getEntryListQueryDescriptor = (queryKey: unknown): EntryListQueryDescriptor | null => {
  if (!Array.isArray(queryKey) || queryKey[0] !== "entries" || !isRecord(queryKey[1])) {
    return null
  }

  const rawQuery = queryKey[1]
  if (!isRecord(rawQuery.scope)) return null
  if (rawQuery.read !== undefined && typeof rawQuery.read !== "boolean") return null

  const rawScope = rawQuery.scope
  let scope: RuntimeEntryListQuery["scope"]
  switch (rawScope.kind) {
    case "timeline": {
      const view = normalizeDescriptorView(rawScope.view)
      if (view === null) return null
      if (rawScope.excludePrivate !== undefined && typeof rawScope.excludePrivate !== "boolean") {
        return null
      }
      scope = {
        kind: "timeline",
        ...(view === undefined ? {} : { view }),
        ...(rawScope.excludePrivate === undefined
          ? {}
          : { excludePrivate: rawScope.excludePrivate }),
      }
      break
    }
    case "feeds": {
      if (!Array.isArray(rawScope.feedIds)) return null
      const feedIds = rawScope.feedIds.map(normalizeDescriptorId)
      if (feedIds.some((feedId) => feedId === null)) return null
      const normalizedFeedIds = Array.from(new Set(feedIds as string[])).sort()
      if (normalizedFeedIds.length === 0) return null
      scope = { kind: "feeds", feedIds: normalizedFeedIds }
      break
    }
    case "list": {
      const listId = normalizeDescriptorId(rawScope.listId)
      if (!listId) return null
      scope = { kind: "list", listId }
      break
    }
    case "inbox": {
      const inboxId = normalizeDescriptorId(rawScope.inboxId)
      if (!inboxId) return null
      scope = { kind: "inbox", inboxId }
      break
    }
    case "collection": {
      const view = normalizeDescriptorView(rawScope.view)
      if (view === null) return null
      scope = { kind: "collection", ...(view === undefined ? {} : { view }) }
      break
    }
    default:
      return null
  }

  return {
    scope,
    ...(rawQuery.read === undefined ? {} : { read: rawQuery.read }),
  }
}

export const invalidateEntriesQuery = ({
  views,
  collection,
}: {
  views?: FeedViewType[]
  collection?: true
}) => {
  return queryClient().invalidateQueries({
    predicate: (query) => {
      const { queryKey } = query
      if (Array.isArray(queryKey) && queryKey[0] === "entries") {
        const entryQuery = queryKey[1] as ReturnType<typeof toEntryListQuery> | undefined
        const scope = entryQuery?.scope
        if (views) {
          return (
            scope?.kind === "timeline" &&
            views.includes((scope.view ?? FeedViewType.All) as FeedViewType)
          )
        }

        if (collection) {
          return (
            scope?.kind === "collection" ||
            (scope?.kind === "feeds" && scope.feedIds.includes(FEED_COLLECTION_LIST))
          )
        }
      }
      return false
    },
  })
}

const defaultStaleTime = 10 * (60 * 1000) // 10 minutes

export const deriveEntriesIds = (query: {
  data?: {
    pages?: Array<{
      data?: Array<{ id?: unknown }>
    }>
  }
  isLoading: boolean
  isError: boolean
}) => {
  if (!query.data || query.isError) {
    return []
  }

  const rawIds = query.data?.pages?.flatMap((page) => page.data?.map((entry) => entry.id))
  const ids = rawIds?.filter((id): id is string => typeof id === "string") || []
  return Array.from(new Set(ids))
}

export const getEntryNextPageParam = (lastPage: EntryQueryHookPage) =>
  lastPage.page.hasMore ? (lastPage.page.nextCursor ?? undefined) : undefined

export const getEntriesQueryKey = (props: FetchEntriesProps) => [
  "entries",
  toEntryListQuery({ ...props, pageParam: undefined }),
  Boolean(props.aiSort),
]

export const useEntriesQuery = (
  props?: Omit<FetchEntriesProps, "pageParam" | "read" | "excludePrivate"> &
    FetchEntriesPropsSettings,
) => {
  const enabled = props?.enabled
  const entryQueryProps = useMemo(() => {
    const { enabled: _enabled, ...queryProps } = props || {}
    return queryProps
  }, [props])
  const {
    feedId,
    inboxId,
    listId,
    view,
    limit,
    feedIdList,
    isCollection,
    unreadOnly,
    hidePrivateSubscriptionsInTimeline,
    aiSort,
  } = entryQueryProps

  const fetchUnread = unreadOnly
  const feedUnreadDirty = useFeedUnreadIsDirty((feedId as string) || "")

  const isPop =
    "history" in globalThis && "isPop" in globalThis.history && !!globalThis.history.isPop
  const fetchProps = useMemo(
    () => ({
      ...entryQueryProps,
      limit: aiSort ? 100 : limit,
      read: unreadOnly ? false : undefined,
      excludePrivate: hidePrivateSubscriptionsInTimeline,
    }),
    [
      props,
      feedId,
      inboxId,
      listId,
      view,
      limit,
      feedIdList,
      isCollection,
      unreadOnly,
      hidePrivateSubscriptionsInTimeline,
      aiSort,
    ],
  )
  const queryKey = useMemo(() => getEntriesQueryKey(fetchProps), [fetchProps])

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      entrySyncServices.fetchEntries({
        ...fetchProps,
        pageParam,
      }),

    getNextPageParam: (lastPage) => (aiSort ? undefined : getEntryNextPageParam(lastPage)),
    initialPageParam: undefined as undefined | string,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // DON'T refetch when the router is pop to previous page
    refetchOnMount: fetchUnread && feedUnreadDirty && !isPop ? "always" : false,

    staleTime:
      // Force refetch unread entries when feed is dirty
      // HACK: disable refetch when the router is pop to previous page
      isPop ? Infinity : fetchUnread && feedUnreadDirty ? 0 : defaultStaleTime,
    enabled: enabled !== false && !!props,
  })

  const entriesIds = useMemo(() => {
    if (!query.data || query.isError) {
      console.log("[Antigravity] entriesIds blocked:", {
        hasData: !!query.data,
        isLoading: query.isLoading,
        isError: query.isError,
        pagesCount: query.data?.pages?.length,
      })
      return []
    }
    const rawIds = deriveEntriesIds(query as any)
    console.log("[Antigravity] entriesIds raw:", rawIds?.length, rawIds?.slice(0, 3))
    return rawIds
  }, [query.data, query.isLoading, query.isError])

  useSyncUnreadWhenUnMatch(entriesIds)

  return useMemo(() => {
    return {
      ...query,
      entriesIds,
      queryKey,
      hasNext: Boolean(query.hasNextPage),
      isReady: query.isSuccess,
    }
  }, [entriesIds, query, queryKey])
}

export const usePrefetchEntryDetail = (entryId: string | undefined, isInbox?: boolean) => {
  return useQuery({
    queryKey: ["entry", entryId],
    queryFn: () => entrySyncServices.fetchEntryDetail(entryId, isInbox),
    initialData: () => (entryId ? (getEntry(entryId) ?? undefined) : undefined),
    initialDataUpdatedAt: () => {
      return entryId && entryActions.isDetailLoaded(entryId) ? Date.now() : 0
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!entryId,
  })
}

const defaultSelector = (state: EntryModel) => state

export function useEntry<T>(
  id: string | undefined,
  selector: (state: EntryModel) => T,
): T | undefined {
  return useEntryStore((state) => {
    if (!id) return
    const entry = state.data[id]
    if (!entry) return
    return selector(entry)
  })
}
export const useHasEntry = (id: string) => {
  return useEntryStore(useCallback((state) => getHasEntrySelector(state)(id), [id]))
}
export function useEntryList(ids: string[]): Array<EntryModel | null>
export function useEntryList<T>(ids: string[], selector: (state: EntryModel) => T): T[] | undefined
export function useEntryList(
  ids: string[],
  selector: (state: EntryModel) => EntryModel = defaultSelector,
) {
  return useEntryStore((state) => {
    return ids.map((id) => {
      const entry = state.data[id]
      if (!entry) return null
      return selector(entry)
    })
  })
}

export const useEntryIdsByView = (view: FeedViewType, excludePrivate: boolean | undefined) => {
  return useEntryStore(
    useCallback(
      (state) => getEntryIdsByViewSelector(state)(view, excludePrivate),
      [excludePrivate, view],
    ),
  )
}

export const useEntryIdsByFeedId = (feedId: string | undefined | null) => {
  return useEntryStore(useCallback((state) => getEntryIdsByFeedIdSelector(state)(feedId), [feedId]))
}

export const useEntryIdsByFeedIds = (feedIds: string[] | undefined) => {
  return useEntryStore(
    useCallback((state) => getEntryIdsByFeedIdsSelector(state)(feedIds), [feedIds?.toString()]),
  )
}

export const useEntryIdsByInboxId = (inboxId: string | undefined) => {
  return useEntryStore(
    useCallback((state) => getEntryIdsByInboxIdSelector(state)(inboxId), [inboxId]),
  )
}

export const useEntryIdsByCategory = (category: string) => {
  return useEntryStore(
    useCallback((state) => getEntryIdsByCategorySelector(state)(category), [category]),
  )
}

export const useEntryIdsByListId = (listId: string | undefined) => {
  return useEntryStore(useCallback((state) => getEntryIdsByListIdSelector(state)(listId), [listId]))
}

export const useEntryIsInbox = (entryId: string) => {
  return useEntryStore(useCallback((state) => getEntryIsInboxSelector(state)(entryId), [entryId]))
}

export const useEntryReadHistory = (entryId: string, size = 20) => {
  const isInboxEntry = useEntryIsInbox(entryId)
  const { data } = useQuery({
    queryKey: ["entry-read-history", entryId],
    queryFn: () => {
      return entrySyncServices.fetchEntryReadHistory(entryId, size)
    },
    staleTime: 1000 * 60 * 5,
    enabled: !isInboxEntry,
  })

  return data
}
