import { isDev } from "~/env"

export const appUpdaterConfig = {
  // Disable renderer hot update will trigger app update when available
  enableRenderHotUpdate: !isDev,
  enableCoreUpdate: !process.mas && !process.windowsStore,
  // Disable app update will also disable renderer hot update and core update
  enableAppUpdate: !isDev,

  app: {
    autoCheckUpdate: true,
    autoDownloadUpdate: true,
    checkUpdateInterval: 15 * 60 * 1000,
  },
}
