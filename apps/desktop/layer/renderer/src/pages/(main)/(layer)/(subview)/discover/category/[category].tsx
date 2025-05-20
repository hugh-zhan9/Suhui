import { isMobile } from "@follow/components/hooks/useMobile.js"
import { EmptyIcon } from "@follow/components/icons/empty.js"
import { Card } from "@follow/components/ui/card/index.jsx"
import { LoadingCircle } from "@follow/components/ui/loading/index.js"
import { EllipsisHorizontalTextWithTooltip } from "@follow/components/ui/typography/EllipsisWithTooltip.js"
import { CategoryMap, RSSHubCategories } from "@follow/constants"
import { isASCII } from "@follow/utils/utils"
import { keepPreviousData } from "@tanstack/react-query"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router"

import { useUISettingKey } from "~/atoms/settings/ui"
import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { useAuthQuery } from "~/hooks/common"
import { useSubViewTitle } from "~/modules/app-layout/subview/hooks"
import { RecommendationContent } from "~/modules/discover/RecommendationContent"
import { FeedIcon } from "~/modules/feed/feed-icon"
import { Queries } from "~/queries"

type Language = "all" | "eng" | "cmn"
type DiscoverCategories = (typeof RSSHubCategories)[number] | string

const LanguageMap = {
  all: "all",
  eng: "en",
  cmn: "zh-CN",
} as const

const fetchRsshubPopular = (category: DiscoverCategories, lang: Language) => {
  return Queries.discover.rsshubCategory({
    // category: "popular",
    categories: category === "all" ? "popular" : `${category}`,
    lang: LanguageMap[lang],
  })
}
export const Component = () => {
  const { t } = useTranslation()
  const lang = useUISettingKey("discoverLanguage")
  const category = useParams().category as (typeof RSSHubCategories)[number]
  const title = t(`discover.category.${category}`, { ns: "common" })
  useSubViewTitle(title)

  const rsshubPopular = useAuthQuery(fetchRsshubPopular(category, lang), {
    staleTime: 1000 * 60 * 60 * 24, // 1 day
    placeholderData: keepPreviousData,
  })

  const { data, isLoading } = rsshubPopular

  const keys = useMemo(() => {
    if (!data) {
      return []
    }
    return Object.keys(data).sort((a, b) => {
      const aname = data[a].name
      const bname = data[b].name

      const aRouteName = data[a].routes[Object.keys(data[a].routes)[0]].name
      const bRouteName = data[b].routes[Object.keys(data[b].routes)[0]].name

      const ia = isASCII(aname) && isASCII(aRouteName)
      const ib = isASCII(bname) && isASCII(bRouteName)

      if (ia && ib) {
        return aname.toLowerCase() < bname.toLowerCase() ? -1 : 1
      } else if (ia || ib) {
        return ia > ib ? -1 : 1
      } else {
        return 0
      }
    })
  }, [data])

  const items = keys.map((key) => {
    return {
      key,
      data: data![key],
      routePrefix: key,
    }
  })

  return (
    <div>
      <div className="mb-10 flex items-center justify-center gap-2 text-center text-2xl font-bold">
        <span>{CategoryMap[category]?.emoji}</span>
        <span>{title}</span>
      </div>
      {isLoading ? (
        <div className="center">
          <LoadingCircle size="large" />
        </div>
      ) : items.length > 0 ? (
        <div className="w-full px-8 pb-8 pt-4">
          <div
            className="animate-in fade-in duration-300"
            style={{
              columnCount: isMobile() ? 1 : 2,
              columnGap: "16px",
              width: "100%",
            }}
          >
            {items.map(
              (item) =>
                item && (
                  <div key={item.key} className="mb-4 break-inside-avoid">
                    <RecommendationListItem data={item.data} routePrefix={item.routePrefix} />
                  </div>
                ),
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full -translate-y-12 flex-col items-center justify-center text-center">
          <div className="mb-4 text-6xl">
            <EmptyIcon />
          </div>
          <p className="text-text text-title2">
            {t("common.noContent", { defaultValue: "No content found in this category" })}
          </p>
          <p className="text-text-secondary text-body mt-2">
            {t("discover.tryAnotherCategory", {
              defaultValue: "Try selecting another category or language",
            })}
          </p>
        </div>
      )}
    </div>
  )
}

const RecommendationListItem = ({ data, routePrefix }: { data: any; routePrefix: string }) => {
  const { t } = useTranslation()
  const { present } = useModalStack()

  const { maintainers, categories, routes } = useMemo(() => {
    const maintainers = new Set<string>()
    const categories = new Set<string>()
    const routes = Object.keys(data.routes)

    for (const route in data.routes) {
      const routeData = data.routes[route]!
      if (routeData.maintainers) {
        routeData.maintainers.forEach((m) => maintainers.add(m))
      }
      if (routeData.categories) {
        routeData.categories.forEach((c) => categories.add(c))
      }
    }
    categories.delete("popular")
    return {
      maintainers: Array.from(maintainers),
      categories: Array.from(categories) as unknown as typeof RSSHubCategories,
      routes,
    }
  }, [data])

  return (
    <Card className="shadow-background border-border overflow-hidden rounded-lg border transition-shadow duration-200 hover:shadow-md">
      <div className="border-border flex items-center gap-3 border-b p-4">
        <div className="bg-background size-8 overflow-hidden rounded-full">
          <FeedIcon className="mr-0 size-8" size={32} siteUrl={`https://${data.url}`} />
        </div>
        <div className="flex w-full flex-1 justify-between">
          <h3 className="text-title3 line-clamp-1 font-medium">
            <a
              href={`https://${data.url}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {data.name}
            </a>
          </h3>

          <div className="flex flex-wrap gap-1.5 text-xs">
            {categories.map((c) => (
              <button
                onClick={() => {
                  // if (!RSSHubCategories.includes(c)) return
                  // setCategory(c)
                }}
                key={c}
                type="button"
                className={`bg-accent/10 cursor-pointer rounded-full px-2 py-0.5 duration-200 ${
                  !RSSHubCategories.includes(c) ? "pointer-events-none opacity-50" : ""
                }`}
              >
                {RSSHubCategories.includes(c)
                  ? t(`discover.category.${c}`, { ns: "common" })
                  : c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="p-4">
        <ul className="text-text mb-3">
          {routes.map((route) => {
            const routeData = data.routes[route]!
            if (Array.isArray(routeData.path)) {
              routeData.path = routeData.path.find((p) => p === route) ?? routeData.path[0]
            }
            return (
              <li
                key={route}
                className="hover:bg-material-opaque -mx-4 flex items-center rounded p-1 px-5 transition-colors"
                role="button"
                onClick={() => {
                  present({
                    id: `recommendation-content-${route}`,
                    content: () => (
                      <RecommendationContent
                        routePrefix={routePrefix}
                        route={data.routes[route]!}
                      />
                    ),
                    icon: <FeedIcon className="size-4" size={16} siteUrl={`https://${data.url}`} />,
                    title: `${data.name} - ${data.routes[route]!.name}`,
                  })
                }}
              >
                <div className="bg-accent mr-2 size-1.5 rounded-full" />
                <div className="relative h-5 grow">
                  <div className="absolute inset-0">
                    <EllipsisHorizontalTextWithTooltip className="text-sm">
                      {routeData.name}
                    </EllipsisHorizontalTextWithTooltip>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {maintainers.length > 0 && (
          <div className="text-text-secondary mt-2 flex items-center text-xs">
            <i className="i-mgc-hammer-cute-re mr-1 shrink-0 translate-y-0.5 self-start" />
            <span>
              {maintainers.map((m, i) => (
                <span key={m}>
                  <a
                    href={`https://github.com/${m}`}
                    className="hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    @{m}
                  </a>
                  {i < maintainers.length - 1 ? ", " : ""}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}
