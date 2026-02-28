import { FeedViewType, getViewList, type ViewDefinition } from "@follow/constants"

const DISABLED_LOCAL_VIEWS = new Set<FeedViewType>([])
const DISABLED_TRENDING_VIEWS = new Set<FeedViewType>([
  FeedViewType.Audios,
  FeedViewType.Notifications,
])

export const getLocalSupportedViewList = (options: { includeAll?: boolean } = {}): ViewDefinition[] => {
  return getViewList(options).filter((view) => !DISABLED_LOCAL_VIEWS.has(view.view))
}

export const getTrendingSupportedViewList = (
  options: { includeAll?: boolean } = {},
): ViewDefinition[] => {
  return getLocalSupportedViewList(options).filter((view) => !DISABLED_TRENDING_VIEWS.has(view.view))
}
