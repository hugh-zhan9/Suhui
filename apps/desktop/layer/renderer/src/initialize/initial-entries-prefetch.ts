import type { GeneralSettings } from "@suhui/shared/settings/interface"
import { getEntriesInfiniteQueryOptions } from "@suhui/store/entry/hooks"
import type { QueryClient } from "@tanstack/react-query"

import { getGeneralSettings } from "~/atoms/settings/general"
import { ROUTE_ENTRY_PENDING, ROUTE_FEED_PENDING } from "~/constants"
import { getRouteParams, type BizRouteParams } from "~/hooks/biz/useRouteParams"
import { queryClient } from "~/lib/query-client"
import { buildEntriesByViewQueryProps } from "~/modules/entry-column/hooks/entries-query-props"

type InitialEntriesSettings = Pick<
  GeneralSettings,
  "unreadOnly" | "hidePrivateSubscriptionsInTimeline"
>

export const deriveDesktopInitialEntriesQueryProps = ({
  route,
  settings,
}: {
  route: BizRouteParams
  settings: InitialEntriesSettings
}) => {
  const isExactPendingTimeline =
    Boolean(route.timelineId) &&
    route.feedId === ROUTE_FEED_PENDING &&
    route.entryId === ROUTE_ENTRY_PENDING &&
    route.isAllFeeds &&
    route.isPendingEntry &&
    !route.isCollection &&
    !route.folderName &&
    !route.inboxId &&
    !route.listId

  if (!isExactPendingTimeline) return

  return buildEntriesByViewQueryProps({
    route,
    folderFeedIds: [],
    activeFeedId: undefined,
    unreadOnly: Boolean(settings.unreadOnly),
    hidePrivateSubscriptionsInTimeline: Boolean(settings.hidePrivateSubscriptionsInTimeline),
  })
}

export const prefetchDesktopInitialEntries = ({
  client = queryClient,
  route = getRouteParams(),
  settings = getGeneralSettings(),
}: {
  client?: QueryClient
  route?: BizRouteParams
  settings?: InitialEntriesSettings
} = {}) => {
  const props = deriveDesktopInitialEntriesQueryProps({ route, settings })
  if (!props) return Promise.resolve()

  return client
    .prefetchInfiniteQuery(
      getEntriesInfiniteQueryOptions(props, { feedUnreadDirty: false, isPop: false }),
    )
    .catch(() => undefined)
}
