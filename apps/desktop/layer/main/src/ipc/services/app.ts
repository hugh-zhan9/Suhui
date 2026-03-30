import fsp from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { callWindowExpose } from "@suhui/shared/bridge"
import { DEV } from "@suhui/shared/constants"
import { app, BrowserWindow, clipboard, dialog, shell } from "electron"
import type { IpcContext } from "electron-ipc-decorator"
import { IpcMethod, IpcService } from "electron-ipc-decorator"
import path from "pathe"

import { START_IN_TRAY_ARGS } from "~/constants/app"
import { getCacheSize } from "~/lib/cleaner"
import { i18n } from "~/lib/i18n"
import { store, StoreKey } from "~/lib/store"
import { registerAppTray } from "~/lib/tray"
import { logger, revealLogFile } from "~/logger"
import { AppManager } from "~/manager/app"
import { DBManager } from "~/manager/db"
import type { DbConfigView } from "~/manager/db-config-view"
import { buildDbConfigView } from "~/manager/db-config-view"
import { getDesktopEnvInfo } from "~/manager/env-loader"
import { WindowManager } from "~/manager/window"
import { cleanupOldRender, loadDynamicRenderEntry } from "~/updater/hot-updater"

import { downloadFile } from "../../lib/download"
import { shouldShowMainWindowOnReady } from "./ready-to-show"

interface WindowActionInput {
  action: "close" | "minimize" | "maximum"
}

interface SearchInput {
  text: string
  options: Electron.FindInPageOptions
}

interface RendererErrorLogInput {
  type: "window-error" | "unhandled-rejection"
  message: string
  location?: string
  stack?: string
}

interface ExportEntryAsPDFInput {
  title?: string
  savePath?: string
  contentHtml?: string
  sourceName?: string
  author?: string
  publishedAt?: string
  url?: string
}

interface Sender extends Electron.WebContents {
  getOwnerBrowserWindow: () => Electron.BrowserWindow | null
}

export class AppService extends IpcService {
  static override readonly groupName = "app"
  private hasHandledReadyToShowMainWindow = false

  @IpcMethod()
  getAppVersion(_context: IpcContext): string {
    return app.getVersion()
  }

  @IpcMethod()
  getDbConfig(_context: IpcContext): DbConfigView {
    return buildDbConfigView({
      env: process.env,
      envInfo: getDesktopEnvInfo(),
    })
  }

  @IpcMethod()
  getDatabaseStatus(_context: IpcContext) {
    return DBManager.getStatus()
  }

  @IpcMethod()
  switchAppLocale(context: IpcContext, input: string): void {
    i18n.changeLanguage(input)
    AppManager.registerMenuAndContextMenu()
    registerAppTray()

    app.commandLine.appendSwitch("lang", input)
  }

  @IpcMethod()
  rendererUpdateReload(_context: IpcContext): void {
    const __dirname = fileURLToPath(new URL(".", import.meta.url))
    const allWindows = BrowserWindow.getAllWindows()
    const dynamicRenderEntry = loadDynamicRenderEntry()

    const appLoadEntry = dynamicRenderEntry || path.resolve(__dirname, "../renderer/index.html")
    logger.info("appLoadEntry", appLoadEntry)
    const mainWindow = WindowManager.getMainWindow()

    for (const window of allWindows) {
      if (window === mainWindow) {
        if (DEV) {
          logger.verbose("[rendererUpdateReload]: skip reload in dev")
          break
        }
        window.loadFile(appLoadEntry)
      } else window.destroy()
    }

    setTimeout(() => {
      cleanupOldRender()
    }, 1000)
  }

  @IpcMethod()
  async openExternal(_context: IpcContext, url: string): Promise<void> {
    if (!url) return

    await shell.openExternal(url)
  }

  @IpcMethod()
  windowAction(context: IpcContext, input: WindowActionInput): void {
    if (context.sender.getType() === "window") {
      const window: BrowserWindow | null = (context.sender as Sender).getOwnerBrowserWindow()

      if (!window) return
      switch (input.action) {
        case "close": {
          window.close()
          break
        }
        case "minimize": {
          window.minimize()
          break
        }
        case "maximum": {
          if (window.isMaximized()) {
            window.unmaximize()
          } else {
            window.maximize()
          }
          break
        }
      }
    }
  }

  @IpcMethod()
  readClipboard(_context: IpcContext): string {
    return clipboard.readText()
  }

  @IpcMethod()
  async search(context: IpcContext, input: SearchInput): Promise<Electron.Result | null> {
    const { sender: webContents } = context

    const { promise, resolve } = Promise.withResolvers<Electron.Result | null>()

    let requestId = -1
    webContents.once("found-in-page", (_, result) => {
      resolve(result.requestId === requestId ? result : null)
    })
    requestId = webContents.findInPage(input.text, input.options)
    return promise
  }

  @IpcMethod()
  clearSearch(context: IpcContext): void {
    context.sender.stopFindInPage("keepSelection")
  }

  @IpcMethod()
  async download(context: IpcContext, input: string): Promise<void> {
    const result = await dialog.showSaveDialog({
      defaultPath: input.split("/").pop(),
    })
    if (result.canceled) return

    try {
      await downloadFile(input, result.filePath)

      const senderWindow = (context.sender as Sender).getOwnerBrowserWindow()
      if (senderWindow) {
        callWindowExpose(senderWindow).toast.success("Download success!", {
          duration: 1000,
        })
      }
    } catch (err) {
      const senderWindow = (context.sender as Sender).getOwnerBrowserWindow()
      if (senderWindow) {
        callWindowExpose(senderWindow).toast.error("Download failed!", {
          duration: 1000,
        })
      }
      throw err
    }
  }

  @IpcMethod()
  getAppPath(_context: IpcContext): string {
    return app.getAppPath()
  }

  @IpcMethod()
  resolveAppAsarPath(context: IpcContext, input: string): string {
    if (input.startsWith("file://")) {
      input = fileURLToPath(input)
    }

    if (path.isAbsolute(input)) {
      return input
    }

    return path.join(app.getAppPath(), input)
  }

  @IpcMethod()
  readyToShowMainWindow(_context: IpcContext) {
    const window = WindowManager.getMainWindow()
    const shouldShowWindow = shouldShowMainWindowOnReady({
      wasOpenedAsHidden: app.getLoginItemSettings().wasOpenedAsHidden,
      startInTray: process.argv.includes(START_IN_TRAY_ARGS),
      handledOnce: this.hasHandledReadyToShowMainWindow,
    })

    if (shouldShowWindow && window && !window.isDestroyed()) {
      window.show()
    }
    this.hasHandledReadyToShowMainWindow = true
  }

  @IpcMethod()
  openCacheFolder(_context: IpcContext): void {
    const dir = path.join(app.getPath("userData"), "cache")
    shell.openPath(dir)
  }

  @IpcMethod()
  getCacheLimit(_context: IpcContext): number {
    return store.get(StoreKey.CacheSizeLimit) || 0
  }

  @IpcMethod()
  async clearCache(_context: IpcContext): Promise<void> {
    const cachePath = path.join(app.getPath("userData"), "cache", "Cache_Data")
    if (process.platform === "win32") {
      // Request elevation on Windows

      try {
        // Create a bat file to delete cache with elevated privileges
        const batPath = path.join(app.getPath("temp"), "clear_cache.bat")
        await fsp.writeFile(batPath, `@echo off\nrd /s /q "${cachePath}"\ndel "%~f0"`, "utf-8")

        // Execute the bat file with admin privileges
        await shell.openPath(batPath)
        return
      } catch (err) {
        logger.error("Failed to clear cache with elevation", { error: err })
      }
    }
    await fsp.rm(cachePath, { recursive: true, force: true }).catch(() => {
      logger.error("Failed to clear cache")
    })
  }

  @IpcMethod()
  limitCacheSize(_context: IpcContext, input: number): void {
    if (input === 0) {
      store.delete(StoreKey.CacheSizeLimit)
    } else {
      store.set(StoreKey.CacheSizeLimit, input)
    }
  }

  @IpcMethod()
  revealLogFile(_context: IpcContext) {
    return revealLogFile()
  }

  @IpcMethod()
  getCacheSize(_context: IpcContext) {
    return getCacheSize()
  }

  @IpcMethod()
  reportRendererError(_context: IpcContext, input: RendererErrorLogInput): void {
    logger.error("[renderer-error]", {
      ...input,
      phase: "startup",
    })
  }

  @IpcMethod()
  async showFolderDialog(context: IpcContext): Promise<string | null> {
    const senderWindow = (context.sender as Sender).getOwnerBrowserWindow()
    if (!senderWindow) return null

    const result = await dialog.showOpenDialog(senderWindow, {
      properties: ["openDirectory", "createDirectory"],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }

  private escapeHtml(value?: string): string {
    if (!value) return ""
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
  }

  private buildEntryPrintHtml(input: ExportEntryAsPDFInput): string {
    const title = this.escapeHtml(input.title || "article")
    const sourceName = this.escapeHtml(input.sourceName || "")
    const author = this.escapeHtml(input.author || "")
    const publishedAt = this.escapeHtml(input.publishedAt || "")
    const url = this.escapeHtml(input.url || "")
    const content = input.contentHtml || ""

    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; }
      html, body { margin: 0; padding: 0; background: #fff; color: #111; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
          "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "Segoe UI",
          system-ui, sans-serif;
        line-height: 1.7;
        font-size: 16px;
      }
      main { max-width: 820px; margin: 0 auto; padding: 32px 24px 48px; }
      h1 { margin: 0 0 12px; font-size: 34px; line-height: 1.3; font-weight: 700; }
      .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
      .meta span { margin-right: 12px; }
      .content img, .content video, .content iframe { max-width: 100%; height: auto; }
      .content pre, .content code { white-space: pre-wrap; word-break: break-word; }
      .content table { border-collapse: collapse; max-width: 100%; overflow-x: auto; display: block; }
      .content a { color: #0a7a43; text-decoration: none; }
      .source-link { margin-top: 20px; font-size: 13px; color: #666; word-break: break-all; }
      @page { margin: 14mm 10mm 14mm; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <div class="meta">
        ${sourceName ? `<span>${sourceName}</span>` : ""}
        ${author ? `<span>${author}</span>` : ""}
        ${publishedAt ? `<span>${publishedAt}</span>` : ""}
      </div>
      <article class="content">${content}</article>
      ${url ? `<div class="source-link">原文链接：${url}</div>` : ""}
    </main>
  </body>
</html>`
  }

  @IpcMethod()
  async exportEntryAsPDF(
    context: IpcContext,
    input: ExportEntryAsPDFInput,
  ): Promise<{ success: boolean; canceled?: boolean }> {
    const senderWindow = (context.sender as Sender).getOwnerBrowserWindow()
    if (!senderWindow) return { success: false }

    // 清洗标题为安全文件名：兼容中英文标点与常见非法字符
    const normalizedTitle = (input.title || "article")
      .normalize("NFKC")
      .replaceAll(/[/\\?%*:|"<>]/g, "_")
      .replaceAll("：", "_")
      .replaceAll(/\s+/g, " ")
      .trim()
      .replaceAll(/[. ]+$/g, "")
    const safeName =
      Array.from(normalizedTitle)
        .filter((char) => {
          const code = char.codePointAt(0) ?? 0
          return !(code <= 0x1f || code === 0x7f)
        })
        .join("") || "article"

    let filePath: string

    if (input.savePath) {
      // 配置了默认路径：直接写入，不弹对话框
      filePath = path.join(input.savePath, `${safeName}.pdf`)
    } else {
      // 未配置默认路径：弹出系统「另存为」对话框
      const result = await dialog.showSaveDialog(senderWindow, {
        defaultPath: path.join(app.getPath("downloads"), `${safeName}.pdf`),
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      })
      if (result.canceled || !result.filePath) return { success: false, canceled: true }
      filePath = result.filePath
    }

    const printWindow = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    try {
      if (!input.contentHtml || !input.contentHtml.trim()) {
        return { success: false }
      }

      const printHtml = this.buildEntryPrintHtml(input)
      await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(printHtml)}`)
      await printWindow.webContents.executeJavaScript(
        "document.fonts ? document.fonts.ready.then(() => true) : Promise.resolve(true)",
      )

      const pdfBuffer = await printWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
      })
      await fsp.writeFile(filePath, pdfBuffer)
    } finally {
      if (!printWindow.isDestroyed()) {
        printWindow.destroy()
      }
    }
    return { success: true }
  }
}
