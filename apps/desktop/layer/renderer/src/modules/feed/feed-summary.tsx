import { EllipsisHorizontalTextWithTooltip } from "@follow/components/ui/typography/EllipsisWithTooltip.js"
import type { FeedOrListRespModel } from "@follow/models/types"
import { env } from "@follow/shared/env.desktop"
import { cn } from "@follow/utils/utils"

import { UrlBuilder } from "~/lib/url-builder"
import { FeedIcon } from "~/modules/feed/feed-icon"
import { FeedTitle } from "~/modules/feed/feed-title"

export function FollowSummary({
  feed,
  docs,
  className,
}: {
  feed: FeedOrListRespModel
  docs?: string
  className?: string
}) {
  let feedText: string | undefined

  switch (feed.type) {
    case "list": {
      feedText = UrlBuilder.shareList(feed.id)
      break
    }
    case "inbox": {
      feedText = `${feed.id}${env.VITE_INBOXES_EMAIL}`
      break
    }
    default: {
      feedText = feed.url || docs
      break
    }
  }

  return (
    <div className={cn("flex select-text flex-col gap-2 text-sm", className)}>
      <div className="flex items-center">
        <FeedIcon
          feed={feed}
          fallbackUrl={docs}
          className="mask-squircle mask mr-3 shrink-0 rounded-none"
          size={32}
        />
        <div className="min-w-0 leading-tight">
          <FeedTitle feed={feed} className="text-base font-semibold" />
          <EllipsisHorizontalTextWithTooltip className="truncate text-xs font-normal text-zinc-500">
            {feed.description}
          </EllipsisHorizontalTextWithTooltip>
        </div>
      </div>
      <div className="flex items-center gap-1 truncate text-zinc-500">
        <i className="i-mgc-right-cute-re shrink-0" />
        <div className="truncate">
          <EllipsisHorizontalTextWithTooltip>{feedText}</EllipsisHorizontalTextWithTooltip>
        </div>
      </div>
    </div>
  )
}
