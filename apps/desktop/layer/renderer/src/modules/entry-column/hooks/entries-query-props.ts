import { FeedViewType } from "@suhui/constants"
import type { FetchEntriesProps, FetchEntriesPropsSettings } from "@suhui/store/entry/types"
import { toEntryListQuery } from "@suhui/store/runtime/client"

import type { BizRouteParams } from "~/hooks/biz/useRouteParams"

export type EntriesByViewQueryProps = Omit<
  FetchEntriesProps,
  "pageParam" | "read" | "excludePrivate"
> &
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
