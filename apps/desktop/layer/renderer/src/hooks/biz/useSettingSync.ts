import { useRegisterGlobalContext } from "@follow/shared/bridge"
import { EventBus } from "@follow/utils/event-bus"
import { getStorageNS } from "@follow/utils/ns"
import { useEffect } from "react"
import { ipcServices } from "~/lib/client"

export const useSettingSync = () => {
  // Listen for local setting changes and report to main process
  useEffect(() => {
    const unsub = EventBus.subscribe("SETTING_CHANGE_EVENT", (data) => {
      // Record operation for git sync
      ipcServices?.sync?.recordOp("setting.update", "setting", data.key, data.payload).catch(console.error)
    })
    return unsub
  }, [])

  // Receive remote setting updates from main process
  useRegisterGlobalContext("syncSettingUpdate", (key, payload) => {
    try {
      const nsKey = getStorageNS(key)
      const existingStr = localStorage.getItem(nsKey)
      let existing: Record<string, any> = {}
      if (existingStr) {
        try {
          existing = JSON.parse(existingStr)
        } catch {
          // ignore parsing errors
        }
      }
      
      const newVal = { ...existing, ...payload }
      // Keep Jotai's updated time consistent if we provide it
      if (!newVal.updated) {
        newVal.updated = Date.now()
      }
      const newValStr = JSON.stringify(newVal)
      
      localStorage.setItem(nsKey, newValStr)
      
      // Dispatch storage event to trigger Jotai atomWithStorage re-render
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: nsKey,
          newValue: newValStr,
          oldValue: existingStr,
          storageArea: localStorage,
        })
      )
    } catch (e) {
      console.error("[useSettingSync] Failed to apply incoming setting sync", e)
    }
  })
}
