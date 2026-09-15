import { useEntry, usePrefetchEntryDetail } from "@suhui/store/entry/hooks"
import { tracker } from "@suhui/tracker"
import { createElement, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useEntryIsInReadability } from "~/atoms/readability"
import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { toast } from "~/lib/toast"

import { ImageGalleryContent } from "./components/ImageGalleryContent"
import { useEntryTranslationQuery } from "./use-entry-translation-query"

export const useGalleryModal = () => {
  const { present } = useModalStack()
  const { t } = useTranslation()
  return useCallback(
    (entryId?: string) => {
      if (!entryId) {
        // this should not happen unless there is a bug in the code
        toast.error("Invalid feed id")
        return
      }
      tracker.entryContentHeaderImageGalleryClick({
        feedId: entryId,
      })
      present({
        title: t("entry_actions.image_gallery"),
        content: () => createElement(ImageGalleryContent, { entryId }),
        max: true,
        clickOutsideToDismiss: true,
      })
    },
    [present, t],
  )
}

export const useEntryContent = (entryId: string) => {
  const entry = useEntry(entryId, (state) => {
    const { inboxHandle, content, readabilityContent } = state
    return {
      inboxId: inboxHandle,
      content,
      readabilityContent,
    }
  })
  const { error, data, isPending, isFetching } = usePrefetchEntryDetail(entryId)

  const isInReadabilityMode = useEntryIsInReadability(entryId)
  const translationQuery = useEntryTranslationQuery(entryId)
  const translationError = translationQuery?.error ?? null
  return useMemo(() => {
    const entryContent = isInReadabilityMode
      ? entry?.readabilityContent
      : (entry?.content ?? data?.content)
    return {
      content: entryContent,
      error,
      isPending: isPending || (isFetching && !entryContent),
      translationError,
      translationQuery,
    }
  }, [
    data?.content,
    entry?.content,
    error,
    isFetching,
    isInReadabilityMode,
    isPending,
    entry?.readabilityContent,
    translationError,
    translationQuery,
  ])
}

export const useEntryMediaInfo = (entryId: string) => {
  return useEntry(entryId, (entry) =>
    Object.fromEntries(
      entry?.media
        ?.filter((m) => m.type === "photo")
        .map((cur) => [
          cur.url,
          {
            width: cur.width,
            height: cur.height,
          },
        ]) ?? [],
    ),
  )
}
