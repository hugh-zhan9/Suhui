import { ResponsiveSelect } from "@follow/components/ui/select/responsive.js"
import { Skeleton } from "@follow/components/ui/skeleton/index.jsx"
import { views } from "@follow/constants"
import type { FeedModel } from "@follow/models"
import { cn } from "@follow/utils/utils"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useGeneralSettingKey } from "~/atoms/settings/general"
import { apiFetch } from "~/lib/api-fetch"

import { FeedCard } from "../discover/feed-card"

const LanguageOptions = [
  {
    label: "All",
    value: "all",
  },
  {
    label: "English",
    value: "eng",
  },
  {
    label: "中文",
    value: "cmn",
  },
]

type Language = (typeof LanguageOptions)[number]["value"]

const rangeOptions = [
  {
    label: "Today",
    value: "1d",
  },
  {
    label: "Three days",
    value: "3d",
  },
  {
    label: "This week",
    value: "7d",
  },
  {
    label: "This month",
    value: "30d",
  },
]

type Range = (typeof rangeOptions)[number]["value"]

const viewOptions = [
  {
    label: "All",
    value: "all",
  },
  ...views.map((view) => ({
    label: view.name,
    value: `${view.view}`,
  })),
]

type View = (typeof viewOptions)[number]["value"]

export function Trending() {
  const { t } = useTranslation()
  const { t: tCommon } = useTranslation("common")
  const lang = useGeneralSettingKey("language")

  const [selectedLang, setSelectedLang] = useState<Language>(lang.startsWith("zh") ? "all" : "eng")
  const [selectedRange, setSelectedRange] = useState<Range>("7d")
  const [selectedView, setSelectedView] = useState<View>("all")

  const { data, isLoading } = useQuery({
    queryKey: ["trending", selectedLang, selectedView, selectedRange],
    queryFn: async () => {
      return await apiFetch<{
        data: {
          feed: FeedModel
        }[]
      }>("/trending/feeds", {
        method: "GET",
        params: {
          language: selectedLang === "all" ? undefined : selectedLang,
          view: selectedView === "all" ? undefined : Number(selectedView),
          limit: 20,
        },
      })
    },
  })

  return (
    <div className="mt-4 w-full max-w-[800px] space-y-6">
      <div className="flex items-center justify-center gap-2 text-center text-xl font-bold">
        <i className="i-mgc-trending-up-cute-re text-xl" />
        <span>{t("words.trending")}</span>
      </div>
      <div className="center flex justify-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-headline text-text font-medium">Language:</span>
          <ResponsiveSelect
            value={selectedLang}
            onValueChange={(value) => {
              setSelectedLang(value as Language)
            }}
            triggerClassName="w-32 h-8 rounded"
            size="sm"
            items={LanguageOptions}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-headline text-text font-medium">Range:</span>
          <ResponsiveSelect
            value={selectedRange}
            onValueChange={(value: string) => {
              setSelectedRange(value as Range)
            }}
            triggerClassName="w-32 h-8 rounded"
            size="sm"
            items={rangeOptions}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-headline text-text font-medium">View:</span>
          <ResponsiveSelect
            value={selectedView}
            onValueChange={(value: string) => {
              setSelectedView(value as View)
            }}
            triggerClassName="w-32 h-8 rounded"
            size="sm"
            items={viewOptions}
            renderItem={(item) => <>{tCommon(item.label as any)}</>}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        {isLoading ? (
          <>
            <Skeleton className="h-[146px]" />
            <Skeleton className="h-[146px]" />
            <Skeleton className="h-[146px]" />
            <Skeleton className="h-[146px]" />
            <Skeleton className="h-[146px]" />
            <Skeleton className="h-[146px]" />
          </>
        ) : (
          data?.data?.map((item, index) => (
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
          ))
        )}
      </div>
    </div>
  )
}
