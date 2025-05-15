import { Text, View } from "react-native"

import { RelativeDateTime } from "@/src/components/ui/datetime/RelativeDateTime"
import { SafeAlertCuteReIcon } from "@/src/icons/safe_alert_cute_re"
import { SafetyCertificateCuteReIcon } from "@/src/icons/safety_certificate_cute_re"
import { User3CuteReIcon } from "@/src/icons/user_3_cute_re"
import type { apiClient } from "@/src/lib/api-fetch"
import { useSubscriptionByFeedId } from "@/src/store/subscription/hooks"
import { useColor } from "@/src/theme/colors"

import { FeedSummary } from "../FeedSummary"

type SearchResultItem = Awaited<ReturnType<typeof apiClient.discover.$post>>["data"][number]

export const SearchFeedCard = ({ item }: { item: SearchResultItem }) => {
  const isSubscribed = useSubscriptionByFeedId(item.feed?.id ?? "")
  const iconColor = useColor("text")

  return (
    <FeedSummary item={item} className="py-8 pl-4">
      <>
        <View className="mt-4 flex-row items-center gap-6 opacity-60">
          <View className="flex-row items-center gap-1.5">
            <User3CuteReIcon width={14} height={14} color={iconColor} />
            <Text className="text-text text-sm">{item.analytics?.subscriptionCount} followers</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            {item.analytics?.updatesPerWeek ? (
              <>
                <SafetyCertificateCuteReIcon width={14} height={14} color={iconColor} />
                <Text className="text-text text-sm">
                  {item.analytics.updatesPerWeek} entries/week
                </Text>
              </>
            ) : item.analytics?.latestEntryPublishedAt ? (
              <>
                <SafeAlertCuteReIcon width={14} height={14} color={iconColor} />
                <Text className="text-text text-sm">Updated</Text>
                <RelativeDateTime
                  className="text-text text-sm"
                  date={new Date(item.analytics.latestEntryPublishedAt)}
                />
              </>
            ) : null}
          </View>
        </View>
        {/* Subscribe */}
        <View className="ml-auto mr-4 mt-1">
          {isSubscribed ? (
            <View className="bg-gray-5/60 rounded-lg px-3 py-2">
              <Text className="text-gray-2 text-sm font-bold">Followed</Text>
            </View>
          ) : (
            <View className="bg-accent rounded-lg px-3 py-2">
              <Text className="text-sm font-bold text-white">Follow</Text>
            </View>
          )}
        </View>
      </>
    </FeedSummary>
  )
}
