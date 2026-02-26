import { FeedViewType, getViewList, type ViewDefinition } from "@follow/constants"

const DISABLED_LOCAL_VIEWS = new Set<FeedViewType>([FeedViewType.Pictures, FeedViewType.Videos])

export const getLocalSupportedViewList = (options: { includeAll?: boolean } = {}): ViewDefinition[] => {
  return getViewList(options).filter((view) => !DISABLED_LOCAL_VIEWS.has(view.view))
}

