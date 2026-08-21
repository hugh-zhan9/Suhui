import { feedSyncServices } from "@suhui/store/feed/store"
import { useMutation } from "@tanstack/react-query"

import { ROUTE_FEED_IN_FOLDER, ROUTE_FEED_PENDING } from "~/constants"
import { useAuthQuery } from "~/hooks/common"
import { ipcServices } from "~/lib/client"
import { defineQuery } from "~/lib/defineQuery"
import { toastFetchError } from "~/lib/error-parser"

type FeedQueryParams = { id?: string; url?: string }

export const feed = {
  byId: ({ id, url }: FeedQueryParams) =>
    defineQuery(
      ["feed", id, url],
      async () =>
        feedSyncServices.fetchFeedById({
          id,
          url,
        }),
      {
        rootKey: ["feed"],
      },
    ),
}

export const useFeedQuery = ({ id, url }: FeedQueryParams) =>
  useAuthQuery(
    feed.byId({
      id,
      url,
    }),
    {
      enabled:
        (!!id || !!url) && id !== ROUTE_FEED_PENDING && !id?.startsWith(ROUTE_FEED_IN_FOLDER),
    },
  )

/** 刷新走主进程的本地抓取，不再打远端。 */
export const useRefreshFeedMutation = (feedId?: string) =>
  useMutation({
    mutationKey: ["refreshFeed", feedId],
    mutationFn: async () => {
      if (!feedId) return
      await ipcServices?.db.refreshFeed(feedId, { source: "manual-single" })
    },
    async onError(err) {
      toastFetchError(err)
    },
  })
