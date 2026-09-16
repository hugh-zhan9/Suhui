import { FeedViewType } from "@suhui/constants"
import { useEntry } from "@suhui/store/entry/hooks"
import { getFeedById } from "@suhui/store/feed/getter"
import { useEntryTranslationProgress } from "@suhui/store/translation/hooks"
import { translationSyncService } from "@suhui/store/translation/store"
import { useMemo } from "react"
import type { JSX } from "react/jsx-runtime"

import { useActionLanguage } from "~/atoms/settings/general"
import {
  MarkdownImageRecordContext,
  MarkdownRenderActionContext,
} from "~/components/ui/markdown/context"
import type { HTMLProps } from "~/components/ui/markdown/HTML"
import { HTML } from "~/components/ui/markdown/HTML"
import { TranslationRetryContext } from "~/components/ui/markdown/TranslationRetry"
import type { MarkdownImage, MarkdownRenderActions } from "~/components/ui/markdown/types"
import { toast } from "~/lib/toast"

import { TimeStamp } from "./components/TimeStamp"
import { EntryInfoContext } from "./context"
import type { EntryContentRendererProps } from "./types"

export function EntryContentHTMLRenderer<AS extends keyof JSX.IntrinsicElements = "div">({
  view,
  feedId,
  entryId,
  children,
  ...props
}: EntryContentRendererProps & HTMLProps<AS>) {
  const language = useActionLanguage()
  const progress = useEntryTranslationProgress(entryId, language)
  const retryContext = useMemo(
    () =>
      progress?.batchState
        ? {
            state: progress.batchState,
            busy: progress.status !== "incomplete",
            retryingBatchId: progress.retryingBatchId,
            retry: (batchId: string) => {
              void translationSyncService.retryBatch(entryId, language, batchId).catch((error) =>
                toast.error("翻译重试失败", {
                  description: error instanceof Error ? error.message : String(error),
                }),
              )
            },
          }
        : null,
    [entryId, language, progress],
  )
  const entry = useEntry(entryId, (state) => {
    const images =
      state.media?.reduce(
        (acc, media) => {
          if (media.height && media.width) {
            acc[media.url] = media
          }
          return acc
        },
        {} as Record<string, MarkdownImage>,
      ) ?? {}

    const { url } = state

    return {
      images,
      url,
    }
  })

  const images: Record<string, MarkdownImage> = useMemo(() => entry?.images ?? {}, [entry])
  const actions: MarkdownRenderActions = useMemo(() => {
    return {
      isAudio() {
        return view === FeedViewType.Audios
      },
      transformUrl(url) {
        if (!url || url.startsWith("http")) return url

        const feed = getFeedById(feedId)
        if (url.startsWith("/") && feed?.siteUrl) return safeUrl(url, feed.siteUrl)

        if (url?.startsWith(".") && entry?.url) return safeUrl(url, entry?.url)

        return url
      },
      ensureAndRenderTimeStamp,
    }
  }, [entry, feedId, view])
  return (
    // eslint-disable-next-line @eslint-react/no-context-provider
    <MarkdownImageRecordContext.Provider value={images}>
      <MarkdownRenderActionContext value={actions}>
        <EntryInfoContext value={useMemo(() => ({ feedId, entryId }), [feedId, entryId])}>
          <TranslationRetryContext value={retryContext}>
            {/*  @ts-expect-error */}
            <HTML {...props}>{children}</HTML>
          </TranslationRetryContext>
        </EntryInfoContext>
      </MarkdownRenderActionContext>
    </MarkdownImageRecordContext.Provider>
  )
}

const safeUrl = (url: string, baseUrl: string) => {
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}

const ensureAndRenderTimeStamp = (children: string) => {
  const firstPart = children.replace(" ", " ").split(" ")[0]
  // 00:00 , 00:00:00
  if (!firstPart) {
    return
  }
  const isTime = isValidTimeString(firstPart.trim())
  if (isTime) {
    return (
      <>
        <TimeStamp time={firstPart} />
        <span>{children.slice(firstPart.length)}</span>
      </>
    )
  }
  return false
}
function isValidTimeString(time: string): boolean {
  const timeRegex = /^\d{1,2}:[0-5]\d(?::[0-5]\d)?$/
  return timeRegex.test(time)
}
