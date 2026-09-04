export type CurrentTranslationOverride = "follow-global" | "force-on" | "force-off"

export type CurrentTranslationOverrideState = {
  entryId: string | null
  override: CurrentTranslationOverride
}

export const overrideForEntry = (state: CurrentTranslationOverrideState, entryId: string) =>
  state.entryId === entryId ? state.override : "follow-global"

export const clearOverrideForEntry = (
  state: CurrentTranslationOverrideState,
  entryId: string,
): CurrentTranslationOverrideState =>
  state.entryId === entryId ? { entryId: null, override: "follow-global" } : state

export const resolveTranslationVisibility = (
  autoEnabled: boolean,
  override: CurrentTranslationOverride,
) => (override === "follow-global" ? autoEnabled : override === "force-on")
