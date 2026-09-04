import { useEntry, usePrefetchEntryDetail } from "@suhui/store/entry/hooks"
import { usePrefetchEntryTranslation } from "@suhui/store/translation/hooks"
import { tracker } from "@suhui/tracker"
import { createElement, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useShowAITranslation } from "~/atoms/ai-translation"
import { useEntryIsInReadability, useEntryIsInReadabilitySuccess } from "~/atoms/readability"
import { useActionLanguage } from "~/atoms/settings/general"
import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { toast } from "~/lib/toast"

import { ImageGalleryContent } from "./components/ImageGalleryContent"

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
      translation: state.settings?.translation,
    }
  })
  const { error, data, isPending, isFetching } = usePrefetchEntryDetail(entryId)

  const isInReadabilityMode = useEntryIsInReadability(entryId)
  const isReadabilitySuccess = useEntryIsInReadabilitySuccess(entryId)

  const enableTranslation = useShowAITranslation(entryId, !!entry?.translation)
  const actionLanguage = useActionLanguage()
  const translationQueries = usePrefetchEntryTranslation({
    entryIds: [entryId],
    enabled: enableTranslation,
    language: actionLanguage,
    withContent: true,
    target: isReadabilitySuccess ? "readabilityContent" : "content",
    respectEntrySetting: false,
  })

  const translationError = translationQueries[0]?.error ?? null
  return useMemo(() => {
    const entryContent = isInReadabilityMode
      ? entry?.readabilityContent
      : (entry?.content ?? data?.content)
    return {
      content: entryContent,
      error,
      isPending: isPending || (isFetching && !entryContent),
      translationError,
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
