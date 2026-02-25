import { DBManager } from "~/manager/db"
import { IpcContext, IpcMethod, IpcService } from "electron-ipc-decorator"
import { FeedService } from "@follow/database/services/feed"
import { SubscriptionService } from "@follow/database/services/subscription"
import { EntryService } from "@follow/database/services/entry"

export class MigrationService extends IpcService {
  static override readonly groupName = "migration"

  @IpcMethod()
  async migrateFromRenderer(_context: IpcContext, data: { 
    feeds: any[], 
    subscriptions: any[], 
    entries: any[] 
  }) {
    console.log(`[Migration] Receiving data from renderer: ${data.feeds.length} feeds, ${data.subscriptions.length} subs, ${data.entries.length} entries`)
    
    try {
      if (data.feeds.length > 0) {
        await FeedService.upsertMany(data.feeds)
      }
      if (data.subscriptions.length > 0) {
        await SubscriptionService.upsertMany(data.subscriptions)
      }
      if (data.entries.length > 0) {
        await EntryService.upsertMany(data.entries)
      }
      
      return { success: true }
    } catch (error: any) {
      console.error("[Migration] Error during migration:", error)
      return { success: false, error: error.message }
    }
  }
}
