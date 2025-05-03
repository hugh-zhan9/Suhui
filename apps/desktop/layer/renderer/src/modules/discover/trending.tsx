import type { FeedModel } from "@follow/models"
import { cn } from "@follow/utils/utils"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { apiFetch } from "~/lib/api-fetch"

import { FeedCard } from "./feed-card"

export function Trending() {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ["trending", "eng"],
    queryFn: async () => {
      return await apiFetch<{
        data: {
          feed: FeedModel
        }[]
      }>("/trending/feeds", {
        method: "GET",
        params: {
          // language: "en",
          // view: 0,
          limit: 20,
        },
      })
    },
  })

  return (
    <div className="mt-4 w-full max-w-[800px]">
      <div className="flex items-center justify-center gap-2 text-center text-lg font-medium">
        <i className="i-mingcute-trending-up-line text-2xl" />
        <span>{t("words.trending")}</span>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-6">
        {data?.data?.map((item, index) => (
          <FeedCard
            key={item.feed.id}
            item={item}
            followButtonVariant="ghost"
            followButtonClassName="border-accent text-accent px-3 -mr-3"
          >
            <div
              className={cn(
                "center absolute -left-5 -top-5 size-12 rounded-br-3xl pl-4 pt-4 text-xs",
                index < 3 ? "bg-accent text-white" : "bg-zinc-100",
              )}
            >
              {index + 1}
            </div>
          </FeedCard>
        ))}
      </div>
    </div>
  )
}
