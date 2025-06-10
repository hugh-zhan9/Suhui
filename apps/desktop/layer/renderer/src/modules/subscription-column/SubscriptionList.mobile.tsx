import { views } from "@follow/constants"
import { cn } from "@follow/utils/utils"
import { memo } from "react"
import { useTranslation } from "react-i18next"

import { useNavigateEntry } from "~/hooks/biz/useNavigateEntry"
import { useRouteParamsSelector } from "~/hooks/biz/useRouteParams"
import { useAuthQuery } from "~/hooks/common"
import { Queries } from "~/queries"
import {
  useCategoryOpenStateByView,
  useFeedsGroupedData,
  useSubscriptionInboxIds,
  useSubscriptionListIds,
} from "~/store/subscription"

import { SortableFeedList, SortByAlphabeticalInbox, SortByAlphabeticalList } from "./sort-by"
import { feedColumnStyles } from "./styles"
import type { SubscriptionProps } from "./SubscriptionList"
import { EmptyFeedList, ListHeader, StarredItem } from "./SubscriptionList.shared"

const FeedListImpl = ({ className, view }: SubscriptionProps) => {
  const feedsData = useFeedsGroupedData(view)
  const listSubIds = useSubscriptionListIds(view)
  const inboxSubIds = useSubscriptionInboxIds(view)
  const categoryOpenStateData = useCategoryOpenStateByView(view)

  const hasData =
    Object.keys(feedsData).length > 0 || listSubIds.length > 0 || inboxSubIds.length > 0

  const { t } = useTranslation()

  // Data prefetch
  useAuthQuery(Queries.lists.list())

  const hasListData = listSubIds.length > 0
  const hasInboxData = inboxSubIds.length > 0

  const currentActiveView = useRouteParamsSelector((s) => s.view)
  // Render only adjacent views
  // 0 => 0, 1
  // 1 => 0, 1, 2
  // 2 => 1, 2, 3
  const shouldRender = view >= Number(currentActiveView) && view < Number(currentActiveView) + 2

  const navigateEntry = useNavigateEntry()

  return (
    <div className={cn(className, "font-medium", !shouldRender && "hidden")}>
      <ListHeader view={view} />

      <div className="relative h-full overflow-y-auto overflow-x-hidden px-3">
        <StarredItem view={view} />
        {hasListData && (
          <>
            <div className="text-text-secondary mt-1 flex h-6 w-full shrink-0 items-center rounded-md px-2.5 text-xs font-semibold transition-colors">
              {t("words.lists")}
            </div>
            <SortByAlphabeticalList view={view} data={listSubIds} />
          </>
        )}
        {hasInboxData && (
          <>
            <div className="text-text-secondary mt-1 flex h-6 w-full shrink-0 items-center rounded-md px-2.5 text-xs font-semibold transition-colors">
              {t("words.inbox")}
            </div>
            <SortByAlphabeticalInbox view={view} data={inboxSubIds} />
          </>
        )}

        <div className="space-y-px" id="feeds-area">
          {(hasListData || hasInboxData) && (
            <div
              className={cn(
                "text-text-secondary mb-1 flex h-6 w-full shrink-0 items-center rounded-md px-2.5 text-xs font-semibold transition-colors",
                Object.keys(feedsData).length === 0 ? "mt-0" : "mt-1",
              )}
            >
              {t("words.feeds")}
            </div>
          )}
          {hasData ? (
            <>
              <button
                type="button"
                onClick={() => {
                  navigateEntry({
                    view,
                    feedId: null,
                  })
                }}
                className={cn(feedColumnStyles.item, "px-2.5 py-0.5")}
              >
                {views[view]!.icon}
                <span className="ml-2">
                  {t("words.all", { ns: "common" })}
                  {t("space", { ns: "common" })}
                  {t(views[view]!.name, { ns: "common" })}
                </span>
              </button>
              <SortableFeedList
                view={view}
                data={feedsData}
                categoryOpenStateData={categoryOpenStateData}
              />
            </>
          ) : (
            <EmptyFeedList />
          )}
        </div>
      </div>
    </div>
  )
}
FeedListImpl.displayName = "FeedListImpl"

export const SubscriptionList = memo(FeedListImpl)
