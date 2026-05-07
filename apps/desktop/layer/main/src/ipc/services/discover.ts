import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import { discoverApplicationService } from "~/application/discover/service"

export class DiscoverService extends IpcService {
  static override readonly groupName = "discover"

  @IpcMethod()
  async getTrendingFeeds(
    _context: IpcContext,
    input: { language?: string; view?: number; limit?: number },
  ) {
    return await discoverApplicationService.getTrendingFeeds(input)
  }

  @IpcMethod()
  async rsshub(
    _context: IpcContext,
    input: { category?: string; categories?: string; lang?: string; namespace?: string },
  ) {
    return await discoverApplicationService.rsshub(input)
  }

  @IpcMethod()
  async rsshubAnalytics(_context: IpcContext, input: { lang?: string }) {
    return await discoverApplicationService.rsshubAnalytics(input)
  }

  @IpcMethod()
  async rsshubRoute(_context: IpcContext, input: { route: string }) {
    return await discoverApplicationService.rsshubRoute(input)
  }
}
