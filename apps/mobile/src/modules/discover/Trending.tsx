import { useQuery } from "@tanstack/react-query"
import { View } from "react-native"

import { PlatformActivityIndicator } from "@/src/components/ui/loading/PlatformActivityIndicator"

import { fetchFeedTrending } from "./api"
import { TrendingFeedCard } from "./TrendingFeedCard"

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
        data?.map((item) => <TrendingFeedCard key={item.feed?.id} item={item} />)
      )}
    </View>
  )
}
