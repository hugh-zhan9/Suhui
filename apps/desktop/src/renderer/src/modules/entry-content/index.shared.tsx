import { getViewport } from "@follow/components/hooks/useViewport.js"
import { CircleProgress } from "@follow/components/icons/Progress.js"
import { AutoResizeHeight } from "@follow/components/ui/auto-resize-height/index.js"
import { Button, MotionButtonBase } from "@follow/components/ui/button/index.js"
import { LoadingWithIcon } from "@follow/components/ui/loading/index.jsx"
import { RootPortal } from "@follow/components/ui/portal/index.jsx"
import { useScrollViewElement } from "@follow/components/ui/scroll-area/hooks.js"
import { IN_ELECTRON, WEB_BUILD } from "@follow/shared/constants"
import { EventBus } from "@follow/utils/event-bus"
import { springScrollTo } from "@follow/utils/scroller"
import { cn } from "@follow/utils/utils"
import type { FallbackRender } from "@sentry/react"
import type { FC } from "react"
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useShowAISummary } from "~/atoms/ai-summary"
import {
  ReadabilityStatus,
  setReadabilityStatus,
  useEntryInReadabilityStatus,
  useEntryReadabilityContent,
} from "~/atoms/readability"
import { useActionLanguage } from "~/atoms/settings/general"
import { enableShowSourceContent } from "~/atoms/source-content"
import { CopyButton } from "~/components/ui/button/CopyButton"
import { Toc } from "~/components/ui/markdown/components/Toc"
import { useEntryReadabilityToggle } from "~/hooks/biz/useEntryActions"
import { useRouteParamsSelector } from "~/hooks/biz/useRouteParams"
import { useAuthQuery } from "~/hooks/common/useBizQuery"
import { getNewIssueUrl } from "~/lib/issues"
import {
  useIsSoFWrappedElement,
  useWrappedElement,
  useWrappedElementSize,
} from "~/providers/wrapped-element-provider"
import { Queries } from "~/queries"
import { useEntry } from "~/store/entry"
import { useFeedById } from "~/store/feed"
import { useInboxById } from "~/store/inbox"

import { EntryContentHTMLRenderer } from "../renderer/html"
import { setEntryContentScrollToTop, setEntryTitleMeta } from "./atoms"

export interface EntryContentProps {
  entryId: string
  noMedia?: boolean
  compact?: boolean
  classNames?: EntryContentClassNames
}
export interface EntryContentClassNames {
  header?: string
}

export const SummaryLoadingSkeleton = (
  <div className="space-y-2">
    <span className="block h-3 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-neutral-800" />
    <span className="block h-3 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-neutral-800" />
    <span className="block h-3 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-neutral-800" />
  </div>
)

export const TitleMetaHandler: Component<{
  entryId: string
}> = ({ entryId }) => {
  const {
    entries: { title: entryTitle },
    feedId,
    inboxId,
  } = useEntry(entryId)!

  const feed = useFeedById(feedId)
  const inbox = useInboxById(inboxId)
  const feedTitle = feed?.title || inbox?.title
  const atTop = useIsSoFWrappedElement()
  useEffect(() => {
    setEntryContentScrollToTop(true)
  }, [entryId])
  useLayoutEffect(() => {
    setEntryContentScrollToTop(atTop)
  }, [atTop])

  useEffect(() => {
    if (entryTitle && feedTitle) {
      setEntryTitleMeta({ title: entryTitle, description: feedTitle })
    }
    return () => {
      setEntryTitleMeta(null)
    }
  }, [entryId, entryTitle, feedTitle])
  return null
}

export const ReadabilityContent = ({ entryId, feedId }: { entryId: string; feedId: string }) => {
  const { t } = useTranslation()
  const result = useEntryReadabilityContent(entryId)
  const view = useRouteParamsSelector((route) => route.view)

  return (
    <div className="grow">
      {result ? (
        <p className="mb-4 rounded-xl border p-3 text-sm opacity-80">
          <i className="i-mgc-information-cute-re mr-1 translate-y-[2px]" />
          {t("entry_content.readability_notice")}
        </p>
      ) : (
        <div className="center mt-16 flex flex-col gap-2">
          <LoadingWithIcon size="large" icon={<i className="i-mgc-docment-cute-re" />} />
          <span className="text-sm">{t("entry_content.fetching_content")}</span>
        </div>
      )}

      <EntryContentHTMLRenderer
        view={view}
        feedId={feedId}
        entryId={entryId}
        as="article"
        className="prose dark:prose-invert prose-h1:text-[1.6em] prose-h1:font-bold hyphens-auto"
      >
        {result?.content ?? ""}
      </EntryContentHTMLRenderer>
    </div>
  )
}

export const NoContent: FC<{
  id: string
  url: string
  sourceContent?: boolean
}> = ({ id, url, sourceContent }) => {
  const status = useEntryInReadabilityStatus(id)
  const { t } = useTranslation("app")

  if (status !== ReadabilityStatus.INITIAL && status !== ReadabilityStatus.FAILURE) {
    return null
  }
  return (
    <div className="center">
      <div className="space-y-2 text-balance text-center text-sm text-zinc-400">
        {(WEB_BUILD || status === ReadabilityStatus.FAILURE) && (
          <span>{t("entry_content.no_content")}</span>
        )}
        {WEB_BUILD && (
          <div>
            <span>{t("entry_content.web_app_notice")}</span>
          </div>
        )}
        {!sourceContent && url && IN_ELECTRON && <ReadabilityAutoToggleEffect url={url} id={id} />}
      </div>
    </div>
  )
}

export const ViewSourceContentAutoToggleEffect = () => {
  const onceRef = useRef(false)

  useEffect(() => {
    if (!onceRef.current) {
      onceRef.current = true
      enableShowSourceContent()
    }
  }, [])

  return null
}

export const ReadabilityAutoToggleEffect = ({ url, id }: { url: string; id: string }) => {
  const toggle = useEntryReadabilityToggle({
    id,
    url,
  })
  const onceRef = useRef(false)

  useEffect(() => {
    if (!onceRef.current) {
      onceRef.current = true
      setReadabilityStatus({
        [id]: ReadabilityStatus.INITIAL,
      })
      toggle()
    }
  }, [toggle])

  return null
}

export const RenderError: FallbackRender = ({ error }) => {
  const { t } = useTranslation()
  const nextError = typeof error === "string" ? new Error(error) : (error as Error)
  return (
    <div className="center mt-16 flex flex-col gap-2">
      <i className="i-mgc-close-cute-re text-3xl text-red-500" />
      <span className="font-sans text-sm">
        {t("entry_content.render_error")} {nextError.message}
      </span>
      <Button
        variant={"outline"}
        onClick={() => {
          window.open(
            getNewIssueUrl({
              // body: [
              //   "### Error",
              //   "",
              //   nextError.message,
              //   "",
              //   "### Stack",
              //   "",
              //   "```",
              //   nextError.stack,
              //   "```",
              // ].join("\n"),
              // label: "bug",
              // title: "Render error",
              template: "bug_report.yml",
            }),
          )
        }}
      >
        {t("entry_content.report_issue")}
      </Button>
    </div>
  )
}

const useReadPercent = () => {
  const y = 55
  const { h } = useWrappedElementSize()

  const scrollElement = useScrollViewElement()
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    const handler = () => {
      if (scrollElement) {
        setScrollTop(scrollElement.scrollTop)
      }
    }
    handler()
    scrollElement?.addEventListener("scroll", handler)
    return () => {
      scrollElement?.removeEventListener("scroll", handler)
    }
  }, [scrollElement])

  const readPercent = useMemo(() => {
    const winHeight = getViewport().h
    const deltaHeight = Math.min(scrollTop, winHeight)

    return Math.floor(Math.min(Math.max(0, ((scrollTop - y + deltaHeight) / h) * 100), 100)) || 0
  }, [y, h, scrollTop])

  return [readPercent, scrollTop]
}

export const ContainerToc: FC = memo(() => {
  const wrappedElement = useWrappedElement()

  return (
    <RootPortal to={wrappedElement!}>
      <div className="group absolute right-[-130px] top-0 h-full w-[100px]" data-hide-in-print>
        <div className="sticky top-0">
          <Toc
            onItemClick={() => {
              EventBus.dispatch("FOCUS_ENTRY_CONTAINER")
            }}
            className={cn(
              "animate-in fade-in-0 slide-in-from-bottom-12 easing-spring spring-soft flex flex-col items-end",
              "scrollbar-none max-h-[calc(100vh-100px)] overflow-auto",
              "@[700px]:-translate-x-12 @[800px]:-translate-x-16 @[900px]:translate-x-0 @[900px]:items-start",
            )}
          />

          <BackTopIndicator
            className={
              "@[700px]:-translate-x-4 @[800px]:-translate-x-8 @[900px]:translate-x-0 @[900px]:items-start"
            }
          />
        </div>
      </div>
    </RootPortal>
  )
})

const BackTopIndicator: Component = memo(({ className }) => {
  const [readPercent] = useReadPercent()
  const scrollElement = useScrollViewElement()

  if (readPercent === 0) return

  return (
    <span
      className={cn(
        "mt-2 flex grow flex-col px-2 font-sans text-sm text-gray-800 dark:text-neutral-300",
        className,
      )}
    >
      <div className="flex items-center gap-2 tabular-nums">
        <CircleProgress percent={readPercent!} size={14} strokeWidth={2} />
        <span>{readPercent}%</span>
        <br />
      </div>
      <MotionButtonBase
        onClick={() => {
          springScrollTo(0, scrollElement!)
        }}
        className={cn(
          "mt-1 flex flex-nowrap items-center gap-2 opacity-50 transition-all duration-500 hover:opacity-100",
          readPercent! > 10 ? "" : "pointer-events-none opacity-0",
        )}
      >
        <i className="i-mingcute-arrow-up-circle-line" />
        <span className="whitespace-nowrap">Back Top</span>
      </MotionButtonBase>
    </span>
  )
})

export function AISummary({ entryId }: { entryId: string }) {
  const { t } = useTranslation()
  const entry = useEntry(entryId)
  const showAISummary = useShowAISummary(entry)
  const actionLanguage = useActionLanguage()
  const summary = useAuthQuery(
    Queries.ai.summary({
      entryId,
      language: actionLanguage,
    }),
    {
      enabled: showAISummary,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      meta: {
        persist: true,
      },
    },
  )

  if (!showAISummary || (!summary.isLoading && !summary.data)) {
    return null
  }

  return (
    <div className="group relative my-8 overflow-hidden rounded-2xl border border-neutral-200/50 bg-gradient-to-b from-neutral-50/80 to-white/40 p-5 backdrop-blur-xl dark:border-neutral-800/50 dark:from-neutral-900/80 dark:to-neutral-900/40">
      {/* Ambient gradient background effect */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-purple-100/20 via-transparent to-blue-100/20 opacity-50 dark:from-purple-900/20 dark:to-blue-900/20" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Glowing AI icon */}
          <div className="relative">
            <i className="i-mgc-magic-2-cute-re text-lg text-purple-600 dark:text-purple-400" />
            <div className="absolute inset-0 animate-pulse rounded-full bg-purple-400/20 blur-sm dark:bg-purple-500/20" />
          </div>
          <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text font-medium text-transparent dark:from-purple-400 dark:to-blue-400">
            {t("entry_content.ai_summary")}
          </span>
        </div>

        {summary.data && (
          <CopyButton
            value={summary.data}
            className={cn(
              "!bg-white/10 !text-purple-600 dark:!text-purple-400",
              "hover:!bg-white/20 dark:hover:!bg-neutral-800/30",
              "!border-purple-200/30 dark:!border-purple-800/30",
              "sm:opacity-0 sm:duration-300 sm:group-hover:translate-y-0 sm:group-hover:opacity-100",
              "backdrop-blur-sm",
            )}
          />
        )}
      </div>

      <AutoResizeHeight
        spring
        className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
      >
        {summary.isLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-3 w-full rounded-lg bg-neutral-200/50 dark:bg-neutral-800/50" />
            <div className="h-3 w-[90%] rounded-lg bg-neutral-200/50 dark:bg-neutral-800/50" />
            <div className="h-3 w-4/5 rounded-lg bg-neutral-200/50 dark:bg-neutral-800/50" />
          </div>
        ) : (
          <div className="animate-in fade-in-0 duration-500">{summary.data}</div>
        )}
      </AutoResizeHeight>
    </div>
  )
}
