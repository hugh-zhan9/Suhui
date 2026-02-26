import { FeedViewType } from "@follow/constants"

export const isArticleLikeListView = (view: FeedViewType) =>
  view === FeedViewType.All || view === FeedViewType.Articles

