import { FeedViewType } from "@suhui/constants"

export const isArticleLikeListView = (view: FeedViewType) =>
  view === FeedViewType.All || view === FeedViewType.Articles

