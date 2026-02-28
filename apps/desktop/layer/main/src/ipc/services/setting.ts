import { createRequire } from "node:module"

import { app, nativeTheme } from "electron"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"

import { rsshubManager } from "~/manager/rsshub"
import { normalizeRsshubAutoStart, RSSHUB_AUTOSTART_STORE_KEY } from "~/manager/rsshub-autostart"
import {
  normalizeRsshubRuntimeMode,
  RSSHUB_RUNTIME_MODE_STORE_KEY,
  type RsshubRuntimeMode,
} from "~/manager/rsshub-runtime-mode"
import { WindowManager } from "~/manager/window"

import { setProxyConfig, updateProxy } from "../../lib/proxy"
import { store } from "../../lib/store"
import { getTrayConfig, setTrayConfig } from "../../lib/tray"

const require = createRequire(import.meta.url)

interface SetLoginItemSettingsInput {
  openAtLogin: boolean
  openAsHidden?: boolean
  path?: string
  args?: string[]
}

export class SettingService extends IpcService {
  static override readonly groupName = "setting"

  @IpcMethod()
  getLoginItemSettings(_context: IpcContext): Electron.LoginItemSettings {
    return app.getLoginItemSettings()
  }

  @IpcMethod()
  setLoginItemSettings(_context: IpcContext, input: SetLoginItemSettingsInput): void {
    app.setLoginItemSettings(input)
  }

  @IpcMethod()
  openSettingWindow(_context: IpcContext): void {
    WindowManager.showSetting()
  }

  @IpcMethod()
  async getSystemFonts(_context: IpcContext): Promise<string[]> {
    const fonts = await require("font-list").getFonts()
    return fonts.map((font: string) => font.replaceAll('"', ""))
  }

  @IpcMethod()
  getAppearance(_context: IpcContext): "light" | "dark" | "system" {
    return nativeTheme.themeSource
  }

  @IpcMethod()
  setAppearance(_context: IpcContext, appearance: "light" | "dark" | "system"): void {
    nativeTheme.themeSource = appearance
  }

  @IpcMethod()
  getMinimizeToTray(_context: IpcContext): boolean {
    return getTrayConfig()
  }

  @IpcMethod()
  setMinimizeToTray(_context: IpcContext, minimize: boolean): void {
    setTrayConfig(minimize)
  }

  @IpcMethod()
  getProxyConfig(_context: IpcContext) {
    const proxy = store.get("proxy")
    return proxy ?? undefined
  }

  @IpcMethod()
  setProxyConfig(_context: IpcContext, config: string) {
    const result = setProxyConfig(config)
    updateProxy()
    return result
  }

  @IpcMethod()
  getMessagingToken(_context: IpcContext): string | null {
    return store.get("notifications-credentials") as string | null
  }

  @IpcMethod()
  getRsshubAutoStart(_context: IpcContext): boolean {
    return normalizeRsshubAutoStart(store.get(RSSHUB_AUTOSTART_STORE_KEY))
  }

  @IpcMethod()
  setRsshubAutoStart(_context: IpcContext, enabled: boolean): void {
    store.set(RSSHUB_AUTOSTART_STORE_KEY, enabled)
  }

  @IpcMethod()
  getRsshubCustomUrl(_context: IpcContext): string {
    return store.get("rsshubCustomUrl") ?? ""
  }

  @IpcMethod()
  setRsshubCustomUrl(_context: IpcContext, url: string): void {
    const trimmed = (url || "").trim()
    if (!trimmed) {
      store.delete("rsshubCustomUrl")
      return
    }
    store.set("rsshubCustomUrl", trimmed)
  }

  @IpcMethod()
  getRsshubRuntimeMode(_context: IpcContext): RsshubRuntimeMode {
    return normalizeRsshubRuntimeMode(store.get(RSSHUB_RUNTIME_MODE_STORE_KEY))
  }

  @IpcMethod()
  async setRsshubRuntimeMode(_context: IpcContext, mode: RsshubRuntimeMode): Promise<void> {
    const normalizedMode = normalizeRsshubRuntimeMode(mode)
    store.set(RSSHUB_RUNTIME_MODE_STORE_KEY, normalizedMode)
    await rsshubManager.setRuntimeMode(normalizedMode)
  }

  @IpcMethod()
  getRsshubTwitterCookie(_context: IpcContext): string {
    return store.get("rsshubTwitterCookie") ?? ""
  }

  @IpcMethod()
  setRsshubTwitterCookie(_context: IpcContext, cookie: string): void {
    const trimmed = (cookie || "").trim()
    if (!trimmed) {
      store.delete("rsshubTwitterCookie")
      return
    }
    store.set("rsshubTwitterCookie", trimmed)
  }
}
