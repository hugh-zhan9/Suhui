import { cn } from "@follow/utils"
import { useQuery } from "@tanstack/react-query"
import { Text, View } from "react-native"

import { PlatformActivityIndicator } from "@/src/components/ui/loading/PlatformActivityIndicator"

import { fetchFeedTrending } from "./api"
import { FeedSummary } from "./FeedSummary"

export const Trending = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["trending", "feeds"],
    queryFn: () =>
      fetchFeedTrending({
        limit: 20,
      }).then((res) => res.data),
  })

  return (
    <View className="mt-4">
      {isLoading ? (
        <View className="mt-5 flex h-12 items-center justify-center">
          <PlatformActivityIndicator />
        </View>
      ) : (
        data?.map((item, index) => (
          <View key={item.feed?.id} className="flex flex-row items-center px-6 py-3">
            <View
              className={cn(
                "flex size-6 items-center justify-center rounded-full",
                index < 3
                  ? cn(
                      "bg-accent text-white",
                      index === 0 && "bg-accent",
                      index === 1 && "bg-accent/90",
                      index === 2 && "bg-accent/80",
                    )
                  : "bg-gray-5/60",
              )}
            >
              <Text className={cn("text-xs font-medium", index < 3 && "text-white")}>
                {index + 1}
              </Text>
            </View>
            <FeedSummary item={item} className="flex-1 pl-4" simple />
          </View>
        ))
      )}
    </View>
  )
}
