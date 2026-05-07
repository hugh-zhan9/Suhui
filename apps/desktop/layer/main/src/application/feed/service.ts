import { FeedRefreshService } from "~/manager/feed-refresh"

export class FeedApplicationService {
  async previewFeed(input: { url: string; feedId?: string; allowPublicRsshub?: boolean }) {
    const url = (input.url || "").trim()
    if (!url) {
      throw new Error("Feed URL is required")
    }
    return FeedRefreshService.buildPreviewData(
      url,
      input.feedId,
      input.allowPublicRsshub === true,
      true,
    )
  }

  async refreshFeed(feedId: string) {
    return FeedRefreshService.refreshFeed(feedId)
  }

  async refreshAllFeeds() {
    return FeedRefreshService.refreshAll()
  }
}

export const feedApplicationService = new FeedApplicationService()
