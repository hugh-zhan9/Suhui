import { createSettingAtom } from "@suhui/atoms/helper/setting.js"
import { IN_ELECTRON } from "@suhui/shared/constants"
import { defaultIntegrationSettings } from "@suhui/shared/settings/defaults"
import type { IntegrationSettings } from "@suhui/shared/settings/interface"

export const createDefaultSettings = (): IntegrationSettings => {
  const defaultSettings = { ...defaultIntegrationSettings }

  // Only include useBrowserFetch setting in Electron environment
  if (!IN_ELECTRON) {
    // Remove useBrowserFetch setting for non-Electron environments
    const { useBrowserFetch, ...settingsWithoutBrowserFetch } = defaultSettings
    return settingsWithoutBrowserFetch as IntegrationSettings
  }

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
