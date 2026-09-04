export const resolveEntryTranslationEnabled = (
  enabled: boolean,
  actionSetting: unknown,
  respectEntrySetting: boolean,
) => enabled || (respectEntrySetting && !!actionSetting)
