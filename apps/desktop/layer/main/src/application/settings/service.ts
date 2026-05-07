import { nativeTheme } from "electron"

import { store } from "~/lib/store"

export type RemoteCapabilities = {
  auth: "none"
  desktopHosted: true
  pdfExport: true
  rsshubConfig: true
  importExport: true
  nativeFolderPicker: false
  openAtLogin: false
  systemFonts: false
  systemNotifications: false
  systemProxy: false
  tray: false
  windowControls: false
}

export type RemoteSettings = {
  appearance: "light" | "dark" | "system"
  rsshubCustomUrl: string
}

const capabilities: RemoteCapabilities = {
  auth: "none",
  desktopHosted: true,
  importExport: true,
  nativeFolderPicker: false,
  openAtLogin: false,
  pdfExport: true,
  rsshubConfig: true,
  systemFonts: false,
  systemNotifications: false,
  systemProxy: false,
  tray: false,
  windowControls: false,
}

export class SettingsApplicationService {
  getCapabilities() {
    return capabilities
  }

  getSettings(): RemoteSettings {
    return {
      appearance: nativeTheme.themeSource,
      rsshubCustomUrl: store.get("rsshubCustomUrl") ?? "",
    }
  }

  updateSettings(input: Partial<RemoteSettings>) {
    if (input.appearance && ["light", "dark", "system"].includes(input.appearance)) {
      nativeTheme.themeSource = input.appearance
    }

    if (input.rsshubCustomUrl !== undefined) {
      this.setRsshubCustomUrl(input.rsshubCustomUrl)
    }

    return this.getSettings()
  }

  getRsshubCustomUrl() {
    return store.get("rsshubCustomUrl") ?? ""
  }

  setRsshubCustomUrl(url: string) {
    const trimmed = (url || "").trim()
    if (!trimmed) {
      store.delete("rsshubCustomUrl")
      return ""
    }
    store.set("rsshubCustomUrl", trimmed)
    return trimmed
  }
}

export const settingsApplicationService = new SettingsApplicationService()
