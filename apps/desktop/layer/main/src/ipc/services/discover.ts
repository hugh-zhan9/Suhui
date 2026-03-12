import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import { requestDiscoverJSON } from "./discover-proxy"

export class DiscoverService extends IpcService {
  static override readonly groupName = "discover"

  @IpcMethod()
  async getTrendingFeeds(
    _context: IpcContext,
    input: { language?: string; view?: number; limit?: number },
  ) {
    return await requestDiscoverJSON("/trending/feeds", input)
  }

  @IpcMethod()
  async rsshub(
    _context: IpcContext,
    input: { category?: string; categories?: string; lang?: string; namespace?: string },
  ) {
    return await requestDiscoverJSON("/discover/rsshub", input)
  }

  @IpcMethod()
  async rsshubAnalytics(_context: IpcContext, input: { lang?: string }) {
    return await requestDiscoverJSON("/discover/rsshub-analytics", input)
  }

  @IpcMethod()
  async rsshubRoute(_context: IpcContext, input: { route: string }) {
    return await requestDiscoverJSON("/discover/rsshub/route", input)
  }
}
