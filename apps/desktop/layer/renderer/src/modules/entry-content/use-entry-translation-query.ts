import { useEntry } from "@suhui/store/entry/hooks"
import { usePrefetchEntryTranslation } from "@suhui/store/translation/hooks"

import { useShowAITranslation } from "~/atoms/ai-translation"
import { useEntryIsInReadabilitySuccess } from "~/atoms/readability"
import { useActionLanguage } from "~/atoms/settings/general"

// Header and reader observe the same query, including the current source revision
// and original-content target. React Query shares the request between observers.
export const useEntryTranslationQuery = (entryId: string) => {
  const entryTranslation = useEntry(entryId, (entry) => entry.settings?.translation)
  const enabled = useShowAITranslation(entryId, !!entryTranslation)
  const language = useActionLanguage()
  const isReadabilitySuccess = useEntryIsInReadabilitySuccess(entryId)
  return usePrefetchEntryTranslation({
    entryIds: [entryId],
    enabled,
    language,
    withContent: true,
    target: isReadabilitySuccess ? "readabilityContent" : "content",
    respectEntrySetting: false,
  })[0]
}
