import { initializeDefaultAISettings } from "~/atoms/settings/ai"
import { initializeDefaultGeneralSettings } from "~/atoms/settings/general"
import { initializeDefaultIntegrationSettings } from "~/atoms/settings/integration"
import { initializeDefaultUISettings } from "~/atoms/settings/ui"
import { ELECTRON_BUILD } from "@suhui/shared/constants"

const applyRestoredRendererSettings = async () => {
  if (!ELECTRON_BUILD) return
  try {
    const { runtimeClient } = await import("@suhui/store/runtime")
    const settings = await runtimeClient.backup.getPendingRendererSettings()
    if (!settings) return
    for (const [key, value] of Object.entries(settings)) {
      if (key === "follow:general" || key === "follow:ui") localStorage.setItem(key, value)
    }
    await runtimeClient.backup.acknowledgeRendererSettings()
  } catch (error) {
    // Leave the journal unacknowledged so the next renderer startup retries it.
    console.error("[Startup] pending renderer settings could not be applied", error)
  }
}

export const initializeSettings = async () => {
  await applyRestoredRendererSettings()
  initializeDefaultUISettings()
  initializeDefaultGeneralSettings()
  initializeDefaultIntegrationSettings()
  initializeDefaultAISettings()
}
