import { Skeleton } from "@follow/components/ui/skeleton/index.js"
import type { FeedOrListRespModel } from "@follow/models"
import type { FC } from "react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { RelativeTime } from "~/components/ui/datetime"

import { FollowSummary } from "../feed/feed-summary"

export interface FeedSummaryProps {
  feed: FeedOrListRespModel

  analytics?: {
    updatesPerWeek: number | null
    subscriptionCount: number | null
    latestEntryPublishedAt: string | null
  }

  showAnalytics?: boolean
}
export const FeedSummary: FC<FeedSummaryProps> = ({ feed, analytics, showAnalytics = true }) => {
  const { t } = useTranslation()
  const numberFormatter = useMemo(() => new Intl.NumberFormat("en-US", {}), [])
  return (
    <div>
      <FollowSummary feed={feed} />

      {showAnalytics && (
        <div className="text-callout mt-2 flex h-6 justify-between gap-4 pl-10">
          {!analytics ? (
            <Skeleton className="mt-1 h-5 w-40" />
          ) : (
            <div className="text-text-secondary flex items-center gap-3">
              {!!analytics?.subscriptionCount && (
                <div className="flex items-center gap-1.5">
                  <i className="i-mgc-user-3-cute-re" />

                  <span>
                    {numberFormatter.format(analytics.subscriptionCount)}{" "}
                    {t("feed.follower", { count: analytics.subscriptionCount })}
                  </span>
                </div>
              )}
              {analytics?.updatesPerWeek ? (
                <div className="flex items-center gap-1.5">
                  <i className="i-mgc-safety-certificate-cute-re" />
                  <span>{t("feed.entry_week", { count: analytics.updatesPerWeek ?? 0 })}</span>
                </div>
              ) : analytics?.latestEntryPublishedAt ? (
                <div className="flex items-center gap-1.5">
                  <i className="i-mgc-safe-alert-cute-re" />
                  <span>{t("feed.updated_at")}</span>
                  <RelativeTime
                    date={analytics.latestEntryPublishedAt}
                    displayAbsoluteTimeAfterDay={Infinity}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
