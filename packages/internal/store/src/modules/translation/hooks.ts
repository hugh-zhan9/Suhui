import type { SupportedActionLanguage } from "@suhui/shared"
import type { SupportedLanguages } from "@follow-app/client-sdk"
import { useQueries } from "@tanstack/react-query"
import { useCallback } from "react"

import { useEntry, useEntryList } from "../entry/hooks"
import type { EntryModel } from "../entry/types"
import { translationActions, translationSyncService, useTranslationStore } from "./store"

type TranslationSource = Pick<
  EntryModel,
  "title" | "description" | "content" | "readabilityContent"
>

export const getTranslationSourceRevision = (entry: TranslationSource) => {
  const source = JSON.stringify([
    entry.title ?? null,
    entry.description ?? null,
    entry.content ?? null,
    entry.readabilityContent ?? null,
  ])
  let revision = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    revision = Math.imul(revision ^ source.charCodeAt(index), 0x01000193)
  }
  return (revision >>> 0).toString(16)
}

export const usePrefetchEntryTranslation = ({
  entryIds,
  withContent,
  target = "content",
  enabled,
  language,
}: {
  entryIds: string[]
  withContent?: boolean
  target?: "content" | "readabilityContent"
  enabled: boolean
  language: SupportedActionLanguage
}) => {
  const entryList = (useEntryList(entryIds)?.filter(
    (entry) => entry !== null && (enabled || !!entry?.settings?.translation),
  ) || []) as EntryModel[]

  return useQueries({
    queries: entryList.map((entry) => {
      const entryId = entry.id
      const targetContent =
        target === "readabilityContent" ? entry.readabilityContent : entry.content
      const finalWithContent = withContent && !!targetContent
      const sourceRevision = getTranslationSourceRevision(entry)

      return {
        queryKey: ["translation", entryId, language, finalWithContent, target, sourceRevision],
        queryFn: async () => {
          translationActions.removeInSession(entryId, language)
          return translationSyncService.generateTranslation({
            entryId,
            language,
            withContent: finalWithContent,
            target,
          })
        },
        retry: false,
      }
    }),
  })
}

export const useEntryTranslation = ({
  entryId,
  language,
  enabled,
}: {
  entryId: string
  language: SupportedLanguages
  enabled: boolean
}) => {
  const actionSetting = useEntry(entryId, (state) => state.settings?.translation)

  return useTranslationStore(
    useCallback(
      (state) => {
        if (!enabled && !actionSetting) return
        return state.data[entryId]?.[language]
      },
      [actionSetting, entryId, language, enabled],
    ),
  )
}
