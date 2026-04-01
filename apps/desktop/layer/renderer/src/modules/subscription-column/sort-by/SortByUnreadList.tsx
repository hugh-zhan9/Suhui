import { useSortedCategoriesByUnread } from "@suhui/store/unread/hooks"
import { Fragment, memo } from "react"

import { useFeedListSortSelector } from "../atom"
import { FeedCategoryAutoHideUnread } from "../FeedCategory"
import type { FeedListProps } from "./types"

export const SortByUnreadFeedList = memo(({ view, data, categoryOpenStateData }: FeedListProps) => {
  const isDesc = useFeedListSortSelector((s) => s.order === "desc")
  const sortedByUnread = useSortedCategoriesByUnread(data, isDesc)
  const sortedList = sortedByUnread ?? []

  return (
    <Fragment>
      {sortedList.map(([category, ids]) => (
        <FeedCategoryAutoHideUnread
          key={category}
          data={ids}
          view={view}
          categoryOpenStateData={categoryOpenStateData}
        />
      ))}
    </Fragment>
  )
})
