import { atom } from "jotai"

import { createAtomHooks } from "~/lib/jotai"

import type {
  CurrentTranslationOverride,
  CurrentTranslationOverrideState,
} from "./ai-translation-state"
import {
  clearOverrideForEntry,
  overrideForEntry,
  resolveTranslationVisibility,
} from "./ai-translation-state"
import { useGeneralSettingKey } from "./settings/general"

// NOTE: We have three levels of settings can enable AI translation or Summary:
// 1. General setting, which is the global settings for all entries.
// 2. Action setting, which is defined in an action and applied to specific entries.
// 3. Toolbar control, which is a temporary setting for the current entry.
//
// When general setting or action setting is enabled, we should hide the toolbar control, which can save some space.
//
// Different from AI summary, AI translation also can show up in the entry list, which should only be controlled by the General setting or Action setting.

export const [
  ,
  ,
  useCurrentTranslationOverrideState,
  ,
  getCurrentTranslationOverrideState,
  setCurrentTranslationOverrideState,
] = createAtomHooks(
  atom<CurrentTranslationOverrideState>({ entryId: null, override: "follow-global" }),
)

export const useCurrentTranslationOverride = (entryId: string) =>
  overrideForEntry(useCurrentTranslationOverrideState(), entryId)

export const getCurrentTranslationOverride = (entryId: string) =>
  overrideForEntry(getCurrentTranslationOverrideState(), entryId)

export const setCurrentTranslationOverride = (
  entryId: string,
  override: CurrentTranslationOverride,
) => setCurrentTranslationOverrideState({ entryId, override })

export const toggleShowAITranslationOnce = (entryId: string) => {
  const override = getCurrentTranslationOverride(entryId)
  setCurrentTranslationOverride(
    entryId,
    resolveTranslationVisibility(false, override) ? "force-off" : "force-on",
  )
}
export const enableShowAITranslationOnce = (entryId: string) =>
  setCurrentTranslationOverride(entryId, "force-on")
export const disableShowAITranslationOnce = () =>
  setCurrentTranslationOverrideState({ entryId: null, override: "follow-global" })
export const clearCurrentTranslationOverrideForEntry = (entryId: string) => {
  setCurrentTranslationOverrideState((state) => clearOverrideForEntry(state, entryId))
}

export const useShowAITranslationAuto = (settings?: boolean | null) => {
  return useGeneralSettingKey("translation") || !!settings
}

export const useShowAITranslation = (entryId: string, settings?: boolean | null) => {
  const showAITranslationAuto = useShowAITranslationAuto(settings)
  const override = useCurrentTranslationOverride(entryId)
  return resolveTranslationVisibility(showAITranslationAuto, override)
}
