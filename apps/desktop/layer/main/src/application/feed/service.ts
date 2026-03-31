import { FeedRefreshService } from "~/manager/feed-refresh"

export class FeedApplicationService {
  async refreshFeed(feedId: string) {
    return FeedRefreshService.refreshFeed(feedId)
  }
}

export const feedApplicationService = new FeedApplicationService()
