import { createSettingAtom } from "@follow/atoms/helper/setting.js"
import { defaultIntegrationSettings } from "@follow/shared/settings/defaults"
import type { IntegrationSettings } from "@follow/shared/settings/interface"

export const createDefaultSettings = (): IntegrationSettings => {
  const defaultSettings = defaultIntegrationSettings

  // Check if we have stored settings that might need migration
  const storedSettings = (() => {
    try {
      const stored = localStorage.getItem("follow:integration")
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })()

  if (storedSettings?.customIntegration) {
    return {
      ...defaultSettings,
      ...storedSettings,
    }
  }

  return defaultSettings
}

export const {
  useSettingKey: useIntegrationSettingKey,
  useSettingSelector: useIntegrationSettingSelector,
  setSetting: setIntegrationSetting,
  clearSettings: clearIntegrationSettings,
  initializeDefaultSettings: initializeDefaultIntegrationSettings,
  getSettings: getIntegrationSettings,
  useSettingValue: useIntegrationSettingValue,
} = createSettingAtom("integration", createDefaultSettings)
