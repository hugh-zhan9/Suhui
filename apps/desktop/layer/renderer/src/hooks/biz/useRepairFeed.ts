import { FeedService } from "@suhui/database/services/feed"
import { IN_ELECTRON } from "@suhui/shared/constants"
import { feedActions } from "@suhui/store/feed/store"
import { unreadSyncService } from "@suhui/store/unread/store"
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query"

import { ipcServices } from "~/lib/client"
import { toast } from "~/lib/toast"

export const useRepairFeed = (feedId: string) => {
  const client = useQueryClient()
  const mutationKey = ["repair-feed", feedId]
  const pending = useIsMutating({ mutationKey }) > 0
  const mutation = useMutation({
    mutationKey,
    mutationFn: async () => {
      if (!IN_ELECTRON || !ipcServices) throw new Error("请在桌面应用中重新查找订阅源")
      const result = await ipcServices.db.repairFeed(feedId)
      const feeds = await FeedService.getFeedAll()
      feedActions.upsertManyInSession(feeds.map((feed) => ({ ...feed, type: "feed" as const })))
      await Promise.all([
        unreadSyncService.resetFromRemote(),
        client.invalidateQueries({ queryKey: ["entries"] }),
      ])
      return result
    },
    onSuccess: (result) =>
      toast.success("订阅源已恢复", {
        description: `${result.previousUrl === result.url ? "已重新验证" : "新地址"}：${result.url}\n新增 ${result.added} 篇文章${result.warning ? `\n${result.warning}` : ""}`,
      }),
    onError: (error) => toast.error("重新查找订阅源失败", { description: error.message }),
  })
  return {
    pending,
    repair: () => {
      if (!pending) mutation.mutate()
    },
  }
}
