import { requestDiscoverJSON } from "~/ipc/services/discover-proxy"

export class DiscoverApplicationService {
  request(path: string, input: Record<string, unknown>) {
    return requestDiscoverJSON(path, input)
  }

  getTrendingFeeds(input: { language?: string; view?: number; limit?: number }) {
    return requestDiscoverJSON("/trending/feeds", input)
  }

  rsshub(input: { category?: string; categories?: string; lang?: string; namespace?: string }) {
    return requestDiscoverJSON("/discover/rsshub", input)
  }

  rsshubAnalytics(input: { lang?: string }) {
    return requestDiscoverJSON("/discover/rsshub-analytics", input)
  }

  rsshubRoute(input: { route: string }) {
    return requestDiscoverJSON("/discover/rsshub/route", input)
  }
}

export const discoverApplicationService = new DiscoverApplicationService()
