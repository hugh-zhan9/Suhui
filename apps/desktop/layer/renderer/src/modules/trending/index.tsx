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

export function Trending({
  limit = 20,
  narrow,
  center,
}: {
  limit?: number
  narrow?: boolean
  center?: boolean
}) {
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
          limit,
        },
      })
    },
  })

  return (
    <div className={cn("mt-4 w-full max-w-[800px] space-y-6", narrow && "max-w-[400px]")}>
      <div className={cn("flex justify-between", narrow && "flex-col gap-4")}>
        <div
          className={cn(
            "flex w-full items-center gap-2 text-xl font-bold",
            narrow && center && "justify-center",
          )}
        >
          <i className="i-mgc-trending-up-cute-re text-xl" />
          <span>{t("words.trending")}</span>
        </div>
        <div className={cn("flex gap-4", center && "center")}>
          <div className="flex items-center">
            <span className="text-text text-sm font-medium">Language:</span>
            <ResponsiveSelect
              value={selectedLang}
              onValueChange={(value) => {
                setSelectedLang(value as Language)
              }}
              triggerClassName="h-8 rounded border-0"
              size="sm"
              items={LanguageOptions}
            />
          </div>
          <div className="flex items-center">
            <span className="text-text text-sm font-medium">Range:</span>
            <ResponsiveSelect
              value={selectedRange}
              onValueChange={(value: string) => {
                setSelectedRange(value as Range)
              }}
              triggerClassName="h-8 rounded border-0"
              size="sm"
              items={rangeOptions}
            />
          </div>
          <div className="flex items-center">
            <span className="text-text text-sm font-medium">View:</span>
            <ResponsiveSelect
              value={selectedView}
              onValueChange={(value: string) => {
                setSelectedView(value as View)
              }}
              triggerClassName="h-8 rounded border-0"
              size="sm"
              items={viewOptions}
              renderItem={(item) => <>{tCommon(item.label as any)}</>}
            />
          </div>
        </div>
      </div>
      <div className={cn("grid grid-cols-2 gap-x-7 gap-y-3", narrow && "grid-cols-1")}>
        {isLoading ? (
          <>
            {Array.from({ length: limit }).map((_, index) => (
              <Skeleton key={index} className="h-[146px]" />
            ))}
          </>
        ) : (
          data?.data?.map((item, index) => (
            <FeedCard
              key={item.feed.id}
              item={item}
              followedButtonVariant="ghost"
              followButtonVariant="ghost"
              followedButtonClassName="px-3 -mr-3"
              followButtonClassName="border-accent text-accent px-3 -mr-3"
              className="pl-2"
            >
              <div
                className={cn(
                  "center absolute -left-5 -top-6 size-12 rounded-br-3xl pl-4 pt-5 text-xs",
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
