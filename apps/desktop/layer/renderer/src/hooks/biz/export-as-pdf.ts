import { FeedViewType } from "@suhui/constants"

const PDF_EXPORT_SUPPORTED_VIEWS = new Set<FeedViewType>([
  FeedViewType.All,
  FeedViewType.Articles,
  FeedViewType.Pictures,
])

export const isPDFExportSupportedView = (view: FeedViewType): boolean =>
  PDF_EXPORT_SUPPORTED_VIEWS.has(view)
