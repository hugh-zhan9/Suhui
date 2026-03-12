import { rmSync } from "node:fs"

import { electronApp, optimizer } from "@electron-toolkit/utils"
import { callWindowExpose } from "@suhui/shared/bridge"
import { DEV, LEGACY_APP_PROTOCOL } from "@suhui/shared/constants"
import { env } from "@suhui/shared/env.desktop"
import { createBuildSafeHeaders } from "@suhui/utils/headers"
import { IMAGE_PROXY_URL } from "@suhui/utils/img-proxy"
import { parse } from "cookie-es"
import { app, BrowserWindow, net, protocol, session } from "electron"
import { join } from "pathe"

import { appendBootLog } from "~/manager/boot-log"
import { DBManager } from "~/manager/db"
import { shouldForwardRendererConsoleError } from "~/manager/renderer-console-filter"
import { SyncManager } from "~/manager/sync"
import { configureSyncLogger } from "~/manager/sync-logger"
import { snapshotBrowserWindow } from "~/manager/window-diagnostics"
import { WindowManager } from "~/manager/window"

import { migrateAuthCookiesToNewApiDomain } from "../lib/auth-cookie-migration"
import { handleUrlRouting } from "../lib/router"
import { store } from "../lib/store"
import { updateNotificationsToken } from "../lib/user"
import { logger } from "../logger"
import { cleanupOldRender } from "../updater/hot-updater"
import { AppManager } from "./app"
import { logNetworkRequestError } from "./network-error-log"

const apiURL = process.env["VITE_API_URL"] || import.meta.env.VITE_API_URL
const bootLogPath = join(app.getPath("logs"), "boot.log")
const buildSafeHeaders = createBuildSafeHeaders(env.VITE_WEB_URL, [
  env.VITE_OPENPANEL_API_URL || "",
  IMAGE_PROXY_URL,
  env.VITE_API_URL,
  "https://readwise.io",
])

export class BootstrapManager {
  public static async start() {
    appendBootLog(bootLogPath, "manager:start")
    configureSyncLogger(() => SyncManager)
    logger.info("[Startup] DBManager.init:start")
    await DBManager.init()
    logger.info("[Startup] DBManager.init:done")
    appendBootLog(bootLogPath, "manager:db-ready")
    logger.info("[Startup] SyncManager.init:start")
    await SyncManager.init()
    logger.info("[Startup] SyncManager.init:done")
    appendBootLog(bootLogPath, "manager:sync-ready")
    AppManager.init()
    logger.info("[Startup] AppManager.init:done")
    appendBootLog(bootLogPath, "manager:app-init")

    const gotTheLock = app.requestSingleInstanceLock()
    if (!gotTheLock) {
      appendBootLog(bootLogPath, "manager:single-instance-denied")
      app.quit()
      return
    }
    appendBootLog(bootLogPath, "manager:single-instance-ok")

    this.registerAppEvents()
  }

  private static registerAppEvents() {
    app.on("second-instance", (_, commandLine) => {
      const mainWindow = WindowManager.getMainWindow()
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
      }

      const url = commandLine.pop()
      if (url) {
        this.handleOpen(url)
      }
    })

    app.whenReady().then(async () => {
      appendBootLog(bootLogPath, "manager:when-ready")
      protocol.handle("app", (request) => {
        try {
          const urlObj = new URL(request.url)
          return net.fetch(`file://${urlObj.pathname}`)
        } catch {
          logger.error("app protocol error", request.url)
          return new Response("Not found", { status: 404 })
        }
      })

      app.on("browser-window-created", (_, window) => {
        optimizer.watchWindowShortcuts(window)
        window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
          if (
            shouldForwardRendererConsoleError({
              level,
              message,
              sourceId,
            })
          ) {
            logger.error("[Renderer Error]", message, line, sourceId)
          }
        })
      })

      electronApp.setAppUserModelId(`re.${LEGACY_APP_PROTOCOL}`)

      session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders = buildSafeHeaders({
          url: details.url,
          headers: details.requestHeaders,
        })

        callback({ cancel: false, requestHeaders: details.requestHeaders })
      })

      session.defaultSession.webRequest.onErrorOccurred((details) => {
        logNetworkRequestError(details, logger)
      })

      await migrateAuthCookiesToNewApiDomain(session.defaultSession, {
        currentApiURL: env.VITE_API_URL,
      })

      logger.info("[Startup] WindowManager.getMainWindowOrCreate:start")
      const mainWindow = WindowManager.getMainWindowOrCreate()
      logger.info(
        "[Startup] WindowManager.getMainWindowOrCreate:done",
        snapshotBrowserWindow(mainWindow),
      )
      appendBootLog(bootLogPath, "manager:window-created")

      app.on("open-url", (_, url) => {
        const activeWindow = WindowManager.getMainWindowOrCreate()
        if (activeWindow && !activeWindow.isDestroyed()) {
          if (activeWindow.isMinimized()) activeWindow.restore()
          activeWindow.focus()
        }
        url && this.handleOpen(url)
      })

      if (DEV) {
        this.installDevTools()
      }

      // 延迟 5s 执行首次并设置定时同步以免阻塞启动
      setTimeout(() => {
        SyncManager.gitSync().catch((err) => logger.error("[Sync] auto sync on start failed:", err))
        setInterval(
          () => {
            SyncManager.gitSync().catch((err) => logger.error("[Sync] periodic sync failed:", err))
          },
          10 * 60 * 1000,
        )
      }, 5000)
    })

    let isSyncingAndQuitting = false

    app.on("before-quit", async (e) => {
      // 拦截关闭，等同步完再真退
      if (!isSyncingAndQuitting && SyncManager.hasSyncRepo()) {
        e.preventDefault()
        isSyncingAndQuitting = true

        try {
          await SyncManager.gitSync()
          logger.info("[Sync] auto sync on quit complete.")
        } catch (err) {
          logger.error("[Sync] auto sync on quit failed:", err)
        }

        app.quit()
        return
      }

      const window = WindowManager.getMainWindow()
      if (!window || window.isDestroyed()) return
      const bounds = window.getBounds()

      store.set(WindowManager.windowStateStoreKey, {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
      })
      await session.defaultSession.cookies.flushStore()
      await cleanupOldRender()
    })

    app.on("window-all-closed", () => {
      app.quit()
    })

    app.on("before-quit", () => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((window) => window.destroy())

      if (import.meta.env.DEV) {
        const cacheDir = join(app.getPath("userData"), "Cache")
        const codeCacheDir = join(app.getPath("userData"), "Code Cache")

        rmSync(cacheDir, { recursive: true, force: true })
        rmSync(codeCacheDir, { recursive: true, force: true })
      }
    })
  }

  private static installDevTools() {
    import("electron-devtools-installer").then(
      ({ default: installExtension, REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS }) => {
        ;[
          REDUX_DEVTOOLS,
          REACT_DEVELOPER_TOOLS,
          { id: "acndjpgkpaclldomagafnognkcgjignd" },
        ].forEach((extension) => {
          installExtension(extension, {
            loadExtensionOptions: { allowFileAccess: true },
          })
            .then((extension) => console.info(`Added Extension:  ${extension.name}`))
            .catch((err) => console.info("An error occurred:", err))
        })

        session.defaultSession.getAllExtensions().forEach((e) => {
          session.defaultSession.loadExtension(e.path)
        })
      },
    )
  }

  private static async handleOpen(url: string) {
    const mainWindow = WindowManager.getMainWindow()
    if (!mainWindow) return

    const isValid = URL.canParse(url)
    if (!isValid) return
    const urlObj = new URL(url)

    if (urlObj.hostname === "auth" || urlObj.pathname === "//auth") {
      const token = urlObj.searchParams.get("token")

      if (token) {
        await callWindowExpose(mainWindow).applyOneTimeToken(token)
      } else {
        const ck = urlObj.searchParams.get("ck")
        const userId = urlObj.searchParams.get("userId")

        if (ck && apiURL) {
          const cookie = parse(atob(ck), { decode: (value) => value })
          Object.keys(cookie).forEach(async (name) => {
            const value = cookie[name]!
            await mainWindow.webContents.session.cookies.set({
              url: apiURL,
              name,
              value,
              secure: true,
              httpOnly: true,
              domain: new URL(apiURL).hostname,
              sameSite: "no_restriction",
              expirationDate: new Date().setDate(new Date().getDate() + 30),
            })
          })

          if (userId) {
            await callWindowExpose(mainWindow).clearIfLoginOtherAccount(userId)
          }
          mainWindow.reload()

          updateNotificationsToken()
        }
      }
    } else {
      handleUrlRouting(url)
    }
  }
}
